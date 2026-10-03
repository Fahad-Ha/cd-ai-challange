# Schema and access-control decisions

This is the second write-up: what the schema is, why each rule lives where it does, what breaks without it, and what I tried that did not work. The approved design spec with the full policy table is in `docs/superpowers/specs/2026-10-03-mytailor-design.md`; the migrations in `supabase/migrations/` are the source of truth.

## The one idea everything follows from

The browser is in the user's hands, and the user might be lying. Anything the app checks in TypeScript, a user can skip by calling the Supabase REST API directly with the same public key the page uses. So the app checks nothing. Every page and server action talks to Supabase with the user's own JWT, and Postgres decides, per row and per column, what that user may read and write. The app's only job is to make the allowed things pleasant and the disallowed things invisible.

Three mechanisms carry that, and each one teaches something different:

- **Row-level security policies** answer "which rows exist for this user?" A row that fails the SELECT policy is not an error; it is simply not there. That is why attack 2 and attack 3 return empty arrays, not 403s.
- **Column-level grants** answer "which columns may this user write?" `GRANT UPDATE (price, turnaround_days, note, status) ON bids` means a tailor can never re-point a bid at another tailor or request, whatever the policy says. RLS cannot express this; grants can.
- **Locked database functions** answer "how does a multi-row state change happen?" Accepting a bid touches a bid, its siblings, the request, and creates an order. That has to be one transaction with one lock, so it is one function that runs as the owner and checks the caller itself.

Plus triggers for the two state machines, so the allowed transitions hold for every writer, including scripts and future code.

## Schema

| Table | What it is | Decisions worth defending |
|---|---|---|
| `profiles` | One row per auth user: `role`, `display_name` | Role is copied once from signup metadata by a trigger, then no grant allows changing it. The app reads the role from here, never from `user_metadata`, which any user can rewrite with one API call. |
| `requests` | A customer's job | `customer_id` defaults to `auth.uid()` and is not insertable, so it cannot be forged. No UPDATE grant at all: the only way a request changes state is `accept_bid()`. `photo_path` must sit under the customer's own storage folder. No `accepted_bid_id` column: `orders.bid_id` already records the winner, and a circular foreign key complicates everything. |
| `bids` | One per tailor per request (`UNIQUE`) | Price, turnaround, note, status. Status is one of `pending`, `declined`, `accepted`, `closed`, exactly the brief's state machine. |
| `bid_revisions` | Append-only history | Written by a trigger on every price/turnaround/note change and on each resubmission after a decline. Clients can only read it, and only when they can see the parent bid. |
| `orders` | Created by `accept_bid()` | Snapshots `price` and `turnaround_days` at acceptance so the order never depends on the bid row again. `completed_at` is tied to status by a CHECK. |
| `messages` | Order chat | `sender_id` defaults to `auth.uid()`; not insertable. The only table in the Realtime publication. |
| `reviews` | One per order (`UNIQUE`) | `customer_id` defaults to `auth.uid()`. Rating 1 to 5 by CHECK. |

Derived values, never stored and never accepted from a client: the bid aggregate per request, a tailor's rating, review count and completed-order count, and "is this request open".

## The trap: bid mutability comes from the parent

The brief warns that a bid must become uneditable the instant its request closes, and that this must not depend on a flag copied onto the bid. The `bids` UPDATE policy is:

```sql
using     (tailor_id = auth.uid() and status in ('pending','declined') and request_is_open(request_id))
with check (tailor_id = auth.uid() and status = 'pending'               and request_is_open(request_id))
```

`request_is_open()` reads `requests.status` at the moment of the write. When `accept_bid()` commits, every other bid is already frozen by this predicate even before the function sets them to `closed`. Setting them to `closed` matters for a different reason (see the race below), but the freeze itself is derived, not stored.

What breaks without it: a tailor could lower their price after seeing they lost, or revise a bid under a customer who is about to accept it. Which leads to the next decision.

## `accept_bid()` and the races I found

The function locks the request row (`SELECT ... FOR UPDATE`), checks the caller is the request's customer, re-reads the bid after taking the lock, compares the price and turnaround the customer saw with what is there now, and then runs every UPDATE with its state in the WHERE clause (`... where id = $1 and status = 'pending'`), raising if zero rows changed.

Two races made this longer than the first draft:

1. **Revise just before accept.** A tailor's revision that commits a millisecond before the customer clicks Accept means the customer accepted a price they never saw. Fix: the Accept button sends the price and turnaround it displayed; the function refuses with "bid was revised since you last saw it" if they differ. The database test `accepting with a stale price is refused` covers it.
2. **Insert just before accept.** A new bid's RLS check (`request_is_open`) runs before the row is written, and the foreign-key lock that would wait for the accept comes later. A bid could land as `pending` on a closed request. Fix: a `BEFORE INSERT` trigger that does `SELECT ... FOR KEY SHARE` on the request with `status = 'open'`; it waits for the accept's `FOR UPDATE` to release and re-evaluates. I deliberately did not attach this to UPDATE, because an update already holds the bid's row lock and would deadlock against `accept_bid()`'s lock order (request first, then bids). The update path is already closed by the status predicate: after the accept commits, the tailor's UPDATE re-checks its WHERE against the new row version and matches nothing.

## Blind bidding and the aggregate that leaked

The policy side is simple: a tailor sees bids where `tailor_id = auth.uid()`, the customer sees bids on their own requests, nobody else sees anything. The aggregate is where I went wrong first. My first version returned count, average price, min and max turnaround. Writing the test made the problem obvious: with two bidders, `2 × avg − mine` is the competitor's exact price, and a min or max is by definition one person's bid. Excluding the caller's own bid is worse (with one competitor, "average of others" is their bid). A rank ("you are lowest") turns unlimited revisions into a binary search. So: count always; averages only when three or more bids exist; never min or max. With three bids a tailor can still compute the sum of the other two; that is the accepted trade-off, and the UI says "averages unlock at 3 bids" so it does not look like a bug.

## Errors that mean the right thing

Plain `RAISE EXCEPTION` in Postgres is SQLSTATE `P0001`, which PostgREST turns into HTTP 400. My first tampering run therefore showed attack 1 as a 400, which reads as "validation error" rather than "forbidden". Authorization failures now raise with `errcode = '42501'` (→ 403 for a signed-in user), and state failures keep `P0001` (→ 400); a bid on a request that has just closed is the latter, so the insert guard trigger raises `P0001` rather than pretending it is a permissions problem. The expected-value guards also refuse `NULL` explicitly (`NULL <> x` is not true in SQL, so a missing value would otherwise skip the check). `src/lib/errors.ts` maps those onto messages a person can act on.

## Things that were wrong in the first draft, found by review or by tests

- **Anonymous callers could execute every function.** Supabase grants EXECUTE to `anon` and `authenticated` on new functions by default, and Postgres itself grants it to PUBLIC. A `SECURITY DEFINER` function callable with the public key is an open door. My first fix was a schema-scoped `ALTER DEFAULT PRIVILEGES ... IN SCHEMA public REVOKE EXECUTE`, and the catalog showed it had only half worked: the schema-scoped entry is a delta on top of Postgres's built-in PUBLIC grant, so Supabase's extra grants went away but every trigger function was still executable by `anon` (harmless today only because trigger functions cannot be called directly). The built-in grant needs a *global* `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM public`. `0001_privileges.sql` now does both, every table and function lists its grants explicitly, and `tests/db/00_catalog.test.ts` asserts against `pg_proc` that no public function is executable by `anon`, so the next migration cannot regress it quietly.
- **The accept re-read was not locked.** `accept_bid()` locked the request, then re-read the bid without a lock. A tailor's revise only locks the bid row, so it was not serialised by the request lock: a revise committing between that re-read and the status UPDATE produced an order at the old price with the bid showing the new one, and the "bid was revised" guard never fired. The re-read is now `SELECT ... FOR UPDATE`, and `tests/db/04_orders_chat.test.ts` reproduces the race deterministically with a second connection that holds the bid lock mid-accept. Lock order is request then bid everywhere, so no deadlock.
- **Storage read was too wide.** "Any signed-in user can read any photo" plus guessable folder names (user ids are visible in `profiles`) meant customers could read each other's photos. Now: your own folder, or any folder if you are a tailor. A request may only reference a photo under its owner's folder.
- **`.upsert()` breaks column grants.** PostgREST's upsert becomes `ON CONFLICT DO UPDATE SET <every column>`, which fails with `permission denied` when the UPDATE grant is column-limited. The bid form therefore inserts or updates explicitly. I kept the grants: they are the one mechanism that stops a tailor rewriting `tailor_id`.
- **Zero-row updates look like success.** When the USING clause filters out every row, PostgREST returns 200 with `[]`. The server actions call `.select('id').maybeSingle()` and treat `null` as "this bid can no longer be edited", so the UI reports a clean failure instead of pretending.
- **Realtime replays and lags.** A fresh subscription on the local stack sometimes receives inserts from just before it attached, and under the full test suite delivery takes seconds. The test now polls for the participant's message and asserts the non-participant received nothing at all, which is the property that matters.
- **Playwright and labels.** `getByLabel(/price/i)` matched the note textarea because its contents mentioned "price"; `sr-only` radio buttons cannot be clicked; Next.js's route announcer also has `role="alert"`. All three were test-side and are fixed in the tests, not the app.

## Stretch goal: the tailor profile

`/tailors/[id]` shows a tailor's average rating, review count and completed-order count. All three come from one function, `tailor_stats()`, that aggregates `reviews` and `orders` in the database. There is no column anyone could edit, and the page says so. It is small on purpose: the point is "derived values live where the data lives", and it reuses the review flow the brief already required.

## Known limits and what I would do next

- The AI route's rate limiter is in memory, per server instance. A shared store would replace it.
- Email confirmations are off so demo accounts work instantly; turning them on needs no schema change.
- Customers cannot edit or cancel a request, and lists are not paginated.
- Tailors can see closed requests in their history only through their own bids; the open-requests list hides them.
- No Arabic/RTL yet; the layout uses logical properties where it was free to, so it is not far off.
