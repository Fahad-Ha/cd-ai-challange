# The Tampering Test — what happened

Every rule in MyTailor is enforced inside Postgres (row-level security, column grants, triggers, and three locked functions). The app never checks "may this user do this" in TypeScript. So the honest way to test it is to skip the app entirely: take the public key and a real user's JWT, hit the REST and Realtime APIs directly, and watch what the database says.

That is exactly what `scripts/tamper.mts` does. It creates throwaway accounts, sets up the situations the brief describes, performs each attack with raw `fetch` calls (so the HTTP status is visible, exactly as it would be in the browser's network tab), and prints the result. Run it with `npm run tamper` (local stack) or point it at the hosted project.

The same five attacks, and about fifty more edge cases, are also asserted by the database test suite in `tests/db/` (`npm run test:db`, 54 tests, including catalog checks of the actual grants and a deterministic lock-race test), and the three that have a UI are covered again by the browser tests in `tests/e2e/`.

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

**In the UI.** The tailor's page shows "On the table: 2 bids, averages unlock at 3 bids (2/3 so far)". The browser tests additionally assert that the page's text never contains a competitor's price, note, or name.

### 3. Open an order chat you're not part of by changing the order ID

**Attempt.** As the tailor who lost the bid: fetch the order by id; fetch its messages; POST a message into it; subscribe to Realtime inserts on `messages` filtered by that order id, then have the customer send a message. A second subscription by the real tailor acts as a control: the spy's silence only counts if the control received the event.

**What happened.** Order → `[]` (the page calls `notFound()` and returns a 404). Messages → `[]`. POST → HTTP 403 `new row violates row-level security policy for table "messages"`. Realtime delivered zero events to the spy while the control subscription received the message (`spy 0, participant control ≥ 1` in the output; the control may also receive a message replayed from just before it subscribed).

**Why.** One function, `is_order_participant(order_id)`, answers both "may I read" and "may I write" for messages, and the `orders` SELECT policy is the same predicate. Supabase Realtime runs the subscriber's JWT through the SELECT policy for every changed row before forwarding it, so the `filter` on the channel is a convenience, not a gate.

**In the UI.** Typing a foreign order id into the URL gives the 404 page. There is no chat to see.

### 4. Post a review on an order that isn't completed, or on someone else's order

**Attempt.** As the customer, review my own order while it is still `accepted`; as a stranger, review it; as the tailor, review myself. (The database suite also posts a second review on a completed order.)

**What happened.** 403 for all three. The duplicate review returns 409 (`23505`).

**Why.** Reviews are deliberately a plain INSERT with no function in front, because the policy reads like the rule in the brief: the row's `customer_id` must be me, and there must exist an order with that id whose customer is me, whose tailor is the `tailor_id` I wrote, and whose status is `completed`. The subquery runs as the caller, so it can only find orders I am on. `UNIQUE(order_id)` makes "once" a constraint, not a check.

**In the UI.** The review form only renders for the customer once the order is `completed`, and disappears after posting. The policy is what makes that true even if the form is forged.

### 5. Search the client bundle for the AI API key

**Attempt.** Build for production with `OPENROUTER_API_KEY` set to a known dummy value, then scan every file under `.next/static` for `sk-or-`, for the literal `OPENROUTER_API_KEY`, and for the key value itself.

**What happened.** 0 matches.

**Why.** Only `src/lib/ai.ts` reads the variable, and that file begins with `import "server-only"`, which makes any import from a client component a build error. It is called from a Route Handler that first verifies the session (`401` when signed out), refuses photo paths outside the caller's own folder (`403`), and downloads the photo with the caller's own Supabase client so storage RLS decides what can be described. The browser only ever sees the resulting text.

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

## Reproducing

```bash
npx supabase start            # local stack
npm run db:reset              # apply the nine migrations
npm run test:db               # 54 database tests, all run as real signed-in users (plus catalog + lock-race checks)
OPENROUTER_API_KEY=sk-or-v1-anything npm run build
npm run tamper                # the five attacks, exits 1 if any succeeds
```

Against the hosted project, create `.env.hosted` with the production URL and keys and run `npx tsx --env-file=.env.hosted scripts/tamper.mts`.
