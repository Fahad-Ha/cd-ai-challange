# The Tampering Test — what happened

Every rule in MyTailor is enforced inside Postgres (row-level security, column grants, triggers, and three locked functions). The app never checks "may this user do this" in TypeScript. So the honest way to test it is to skip the app entirely: take the public key and a real user's JWT, hit the REST and Realtime APIs directly, and watch what the database says.

During development that was done with a script: it created throwaway accounts, set up the situations the brief describes, performed each attack with raw `fetch` calls (so the HTTP status was visible, exactly as it would be in the browser's network tab) and printed the result. Its raw output, first against the local stack and then against the production project after `supabase db push`, is reproduced at the end of this document. The script and the database test suite behind it were removed from the repository once the design was settled; the attacks are repeated by hand in the live session with `docs/tamper-console.js`, which does the same calls from the browser console as the logged-in user.

## Summary

| # | Attack | Result | What stopped it |
|---|---|---|---|
| 1 | Accept your own bid as a tailor | HTTP 403, bid still pending | `accept_bid()` compares `auth.uid()` with the request's `customer_id` (`supabase/migrations/0008_rpcs.sql`) |
| 2 | Fetch another tailor's full bid | Only my own row; competitor's id → `[]`; revisions → `[]`; stats show count only | `bids` SELECT policy (`0004_bids.sql`); `request_bid_stats()` withholds averages below 3 bids |
| 3 | Open an order chat you're not part of | order → `[]` (page 404s); messages → `[]`; POST → 403; 0 realtime events | `orders`/`messages` policies via `is_order_participant()` (`0005`, `0006`); Realtime re-checks the SELECT policy per subscriber |
| 4 | Review an unfinished order, or someone else's | 403 ×3; a second review on a completed order → 409 | `reviews` INSERT policy joins `orders` on customer + status `completed` (`0007_reviews.sql`); `UNIQUE(order_id)` |
| 5 | Find the AI key in the client bundle | 0 matches across `.next/static` | Key is read only in `src/lib/ai.ts`, which starts with `import "server-only"`; no `NEXT_PUBLIC_` prefix |

## Attack by attack

### 1. Accept your own bid as a tailor

**Attempt.** Signed in as a tailor, call the same function the customer's Accept button calls: `POST /rest/v1/rpc/accept_bid` with my own bid id and my own price.

**What happened.** HTTP 403 with `{"code":"42501","message":"Only the request's customer can accept a bid"}`. The bid is still `pending`; no order row exists.

**Why.** `accept_bid()` runs as the database owner (it has to: the caller has no UPDATE on `requests` or `orders`), so the first thing it does is read the request row, lock it, and compare `customer_id` to `auth.uid()`. It raises with SQLSTATE `42501`, which PostgREST maps to 403, so the client can tell "you may not" from "not any more" (state errors use `P0001` → 400). There is no other way to set a bid to `accepted`: tailors have UPDATE on the `status` column, but the UPDATE policy's `WITH CHECK` only admits `status = 'pending'`.

**In the UI.** A tailor never sees an Accept button. If they forge the request anyway, the server action returns the message above as an inline error.

### 2. Fetch another tailor's full bid on a request you're also bidding on

**Attempt.** As tailor A, on a request where tailor B also bid: list all bids for the request; fetch B's bid by its exact id; fetch B's revision history; call the aggregate function with only two bids on the table.

**What happened.** The list returned exactly one row (mine). B's id returned `200 []`. Revisions returned `[]`. The aggregate returned `{"bid_count":2,"avg_price":null,"avg_turnaround":null}`.

**Why.** The `bids` SELECT policy is `tailor_id = auth.uid() OR <I own the request>`. Rows that fail it do not error; they do not exist for that connection, so filtering by id finds nothing. `bid_revisions` has no policy of its own; it asks "can you see the parent bid?" and inherits the answer. The aggregate is the one place a tailor learns anything about competitors, and it was the hardest part to get right: with two bids, `2 × average − mine` is the other tailor's price exactly, and min/max are always somebody's bid. So the function returns the count always, averages only once three bids exist, and never min/max. Realtime is irrelevant here because `bids` is not in the `supabase_realtime` publication.

**In the UI.** The tailor's page shows "On the table: 2 bids, averages unlock at 3 bids (2/3 so far)".

### 3. Open an order chat you're not part of by changing the order ID

**Attempt.** As the tailor who lost the bid: fetch the order by id; fetch its messages; POST a message into it; subscribe to Realtime inserts on `messages` filtered by that order id, then have the customer send a message. A second subscription by the real tailor acts as a control: the spy's silence only counts if the control received the event.

**What happened.** Order → `[]` (the page calls `notFound()` and returns a 404). Messages → `[]`. POST → HTTP 403 `new row violates row-level security policy for table "messages"`. Realtime delivered zero events to the spy while the control subscription received the message (`spy 0, participant control ≥ 1` in the output; the control may also receive a message replayed from just before it subscribed).

**Why.** One function, `is_order_participant(order_id)`, answers both "may I read" and "may I write" for messages, and the `orders` SELECT policy is the same predicate. Supabase Realtime runs the subscriber's JWT through the SELECT policy for every changed row before forwarding it, so the `filter` on the channel is a convenience, not a gate.

**In the UI.** Typing a foreign order id into the URL gives the 404 page. There is no chat to see.

### 4. Post a review on an order that isn't completed, or on someone else's order

**Attempt.** As the customer, review my own order while it is still `accepted`; as a stranger, review it; as the tailor, review myself. Then, on a completed order, post a second review.

**What happened.** 403 for all three. The duplicate review returns 409 (`23505`).

**Why.** Reviews are deliberately a plain INSERT with no function in front, because the policy reads like the rule in the brief: the row's `customer_id` must be me, and there must exist an order with that id whose customer is me, whose tailor is the `tailor_id` I wrote, and whose status is `completed`. The subquery runs as the caller, so it can only find orders I am on. `UNIQUE(order_id)` makes "once" a constraint, not a check.

**In the UI.** The review form only renders for the customer once the order is `completed`, and disappears after posting. The policy is what makes that true even if the form is forged.

### 5. Search the client bundle for the AI API key

**Attempt.** Build for production with `OPENROUTER_API_KEY` set to a known dummy value, then scan every file under `.next/static` for `sk-or-`, for the literal `OPENROUTER_API_KEY`, and for the key value itself.

**What happened.** 0 matches.

**Why.** Only `src/lib/ai.ts` reads the variable, and that file begins with `import "server-only"`, which makes any import from a client component a build error. It is called from a Route Handler that first verifies the session (`401` when signed out), refuses photo paths outside the caller's own folder (`403`), charges a database-side quota before spending anything (`429` once a user passes 15 calls in a day or everyone together passes 200), and downloads the photos with the caller's own Supabase client so storage RLS decides what can be described. The browser only ever sees the resulting text.

## Raw output of the script (hosted project, 2026-10-04)

Same script, pointed at the production Supabase project after `supabase db push`. Attack 5 scans the local production build (`.next/static`), which is the same bundle Vercel serves.

```
    Target: https://zthrdbbunspivagzwdjd.supabase.co
    
    [1] Accept your own bid as a tailor
        attempt : POST /rest/v1/rpc/accept_bid {p_bid_id: <my bid>} as Attacker Tailor
        response: HTTP 403 {"code":"42501","details":null,"hint":null,"message":"Only the request's customer can accept a bid"} — bid status afterwards: pending
        verdict : HELD ✅
    
    [2] Fetch another tailor's full bid on a request you're also bidding on
        attempt : GET /rest/v1/bids?request_id=eq.<request> · GET /rest/v1/bids?id=eq.<B's bid id> · GET /rest/v1/bid_revisions?bid_id=eq.<B's bid id> · POST rpc/request_bid_stats
        response: list → [{"id":"0dc050a1-a668-42b3-8411-5c4a9755c5eb","price":100,"note":"A","tailor_id":"eb0a20b5-5be9-42e9-a4b0-8ac619456fd8"}] (only my own row) · direct → HTTP 200 [] · revisions → [] · stats → [{"bid_count":2,"avg_price":null,"avg_turnaround":null}] (2 bids: count only, averages withheld)
        verdict : HELD ✅
    
    [3] Open an order chat you're not part of by changing the order ID
        attempt : GET /rest/v1/orders?id=eq.<order> · GET /rest/v1/messages?order_id=eq.<order> · POST /rest/v1/messages · Realtime subscribe to messages:order_id=eq.<order>, all as a tailor who lost the bid
        response: order → [] (page would 404) · messages → [] · POST → HTTP 403 {"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for table \"messages\""} · realtime events: spy 0, participant control 1
        verdict : HELD ✅
    
    [4] Post a review on an order that isn't completed, or on someone else's order
        attempt : POST /rest/v1/reviews as the customer (order status: accepted) · as a stranger · as the tailor
        response: not completed → HTTP 403 {"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for table \"reviews\""} · stranger → HTTP 403 · tailor → HTTP 403
        verdict : HELD ✅
    
    [5] Search the client bundle for the AI API key
        attempt : scan every file under .next/static for "sk-or-", "OPENROUTER_API_KEY" and the key value itself
        response: 0 matches
        verdict : HELD ✅
    
    ==== TAMPERING TEST SUMMARY ====
    HELD    [1] Accept your own bid as a tailor
    HELD    [2] Fetch another tailor's full bid on a request you're also bidding on
    HELD    [3] Open an order chat you're not part of by changing the order ID
    HELD    [4] Post a review on an order that isn't completed, or on someone else's order
    HELD    [5] Search the client bundle for the AI API key
    
    All five attacks failed cleanly — PASS
```

## Raw output of the script (local stack)

```
    Target: http://127.0.0.1:54321
    
    [1] Accept your own bid as a tailor
        attempt : POST /rest/v1/rpc/accept_bid {p_bid_id: <my bid>} as Attacker Tailor
        response: HTTP 403 {"code":"42501","details":null,"hint":null,"message":"Only the request's customer can accept a bid"} — bid status afterwards: pending
        verdict : HELD ✅
    
    [2] Fetch another tailor's full bid on a request you're also bidding on
        attempt : GET /rest/v1/bids?request_id=eq.<request> · GET /rest/v1/bids?id=eq.<B's bid id> · GET /rest/v1/bid_revisions?bid_id=eq.<B's bid id> · POST rpc/request_bid_stats
        response: list → [{"id":"504a4a12-f962-409b-bfa6-504880086232","price":100,"note":"A","tailor_id":"967e8895-d7fd-4bbe-8d84-4d917a7fa527"}] (only my own row) · direct → HTTP 200 [] · revisions → [] · stats → [{"bid_count":2,"avg_price":null,"avg_turnaround":null}] (2 bids: count only, averages withheld)
        verdict : HELD ✅
    
    [3] Open an order chat you're not part of by changing the order ID
        attempt : GET /rest/v1/orders?id=eq.<order> · GET /rest/v1/messages?order_id=eq.<order> · POST /rest/v1/messages · Realtime subscribe to messages:order_id=eq.<order>, all as a tailor who lost the bid
        response: order → [] (page would 404) · messages → [] · POST → HTTP 403 {"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for table \"messages\""} · realtime events: spy 0, participant control 2
        verdict : HELD ✅
    
    [4] Post a review on an order that isn't completed, or on someone else's order
        attempt : POST /rest/v1/reviews as the customer (order status: accepted) · as a stranger · as the tailor
        response: not completed → HTTP 403 {"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for table \"reviews\""} · stranger → HTTP 403 · tailor → HTTP 403
        verdict : HELD ✅
    
    [5] Search the client bundle for the AI API key
        attempt : scan every file under .next/static for "sk-or-", "OPENROUTER_API_KEY" and the key value itself
        response: 0 matches
        verdict : HELD ✅
    
    ==== TAMPERING TEST SUMMARY ====
    HELD    [1] Accept your own bid as a tailor
    HELD    [2] Fetch another tailor's full bid on a request you're also bidding on
    HELD    [3] Open an order chat you're not part of by changing the order ID
    HELD    [4] Post a review on an order that isn't completed, or on someone else's order
    HELD    [5] Search the client bundle for the AI API key
    
    All five attacks failed cleanly — PASS
```

## Reproducing by hand

1. Log in to the deployed site as the user you want to attack as (demo accounts: `customer@demo.local` and `tailor@demo.local`, password `demo1234`; sign up a second tailor for attack 2).
2. Open DevTools → Console, paste `docs/tamper-console.js`, press Enter. It reads your login token from the cookie and defines `api(path, body)`.
3. Run the attack lines it prints, filling in ids from the page URLs. The responses should match the ones above: `403` with `42501` for anything you may not do, empty arrays for rows that do not exist for you, `409` for a duplicate review.
4. For attack 5, search the loaded JavaScript in the Sources tab for `sk-or-` and `OPENROUTER`.
