# Write-up 2: Schema and access-control decisions

Fahad Ahmad · 4 October 2026 · Live site: https://coded-ai-challange.vercel.app · Repo: https://github.com/Fahad-Ha/cd-ai-challange

This is the second write-up: what the schema is, why each rule lives where it does, what breaks without it, and what I tried that did not work. The migrations in `supabase/migrations/` are the source of truth; each file opens with a comment saying what it protects and why.

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
| `requests` | A customer's job | `customer_id` defaults to `auth.uid()` and is not insertable, so it cannot be forged. No UPDATE grant at all: the only way a request changes state is `accept_bid()`. `photo_paths` holds up to six storage paths, and the policy checks every one of them sits under the customer's own folder. No `accepted_bid_id` column: `orders.bid_id` already records the winner, and a circular foreign key complicates everything. |
| `bids` | One per tailor per request (`UNIQUE`) | Price, turnaround, note, status. Status is one of `pending`, `declined`, `accepted`, `closed`, exactly the brief's state machine. |
| `bid_revisions` | Append-only history | Written by a trigger on every price/turnaround/note change and on each resubmission after a decline. Clients can only read it, and only when they can see the parent bid. |
| `orders` | Created by `accept_bid()` | Snapshots `price` and `turnaround_days` at acceptance so the order never depends on the bid row again. `completed_at` is tied to status by a CHECK. |
| `messages` | Order chat | `sender_id` defaults to `auth.uid()`; not insertable. The only table in the Realtime publication. |
| `reviews` | One per order (`UNIQUE`) | `customer_id` defaults to `auth.uid()`. Rating 1 to 5 by CHECK. |

Reference photos live in a private storage bucket under a folder named by the customer's id. A customer can read and write only their own folder. A tailor can read a photo only if it is attached to a request they are entitled to see: an open request, or a request whose order is theirs; unattached uploads and other tailors' closed jobs are not readable. Nobody else can see anything. The app shows photos through short-lived signed links created with the viewer's own session, so the same rule gates the link as gates the file. (The first version let any tailor read any file in the bucket; since paths are random that was hard to abuse, but "hard to find" is not "not allowed", so it was tightened.)

Derived values, never stored and never accepted from a client: the bid aggregate per request, a tailor's rating, review count and completed-order count, and "is this request open".

## The trap: bid mutability comes from the parent

The brief warns that a bid must become uneditable the instant its request closes, and that this must not depend on a flag copied onto the bid. The `bids` UPDATE policy is:

```sql
using     (tailor_id = auth.uid() and status in ('pending','declined') and request_is_open(request_id))
with check (tailor_id = auth.uid() and status = 'pending'               and request_is_open(request_id))
```

`request_is_open()` reads `requests.status` at the moment of the write. When `accept_bid()` commits, every other bid is already frozen by this predicate even before the function sets them to `closed`. Setting them to `closed` matters for a different reason (see the race below), but the freeze itself is derived, not stored.

What breaks without it: a tailor could lower their price after seeing they lost, or revise a bid under a customer who is about to accept it. Which leads to the next decision.

## How accepting a bid works

Accepting touches several rows at once: the winning bid, every other bid on the request, the request itself, and a new order. That has to be one atomic step, so it is one database function. It locks the request first, checks that the caller is the customer who posted it, confirms the request is still open and the bid still pending, and only then updates everything in a single transaction. The Accept button also sends the price and turnaround the customer saw; if the tailor revised the bid in the meantime, the function refuses with "the bid was revised, please review" instead of accepting terms the customer never agreed to (the bug behind that guard is in the list below).
## Blind bidding and the summary that gave the price away

The visibility rule is simple: a tailor sees their own bid, the customer sees every bid on their own request, nobody else sees anything. The hard part was the small summary shown to tailors so they get a feel for the market ("2 bids, average 350 KWD").

An average can be reversed. Suppose you bid 300 and the page says "2 bids, average 350". Two bids averaging 350 add up to 700, yours is 300, so the other tailor bid 400. The summary just told you the competitor's exact price, which is the one thing blind bidding must never do. "Lowest turnaround: 5 days" leaks the same way, because the lowest value is always one specific tailor's bid.

So the summary now works like this: the number of bids is always shown, because it reveals nothing; averages appear only once three or more bids exist, because then you can only tell what the other bids add up to, not what any one of them is; and lowest or highest values are never shown. The card says "averages appear once there are 3" so the missing numbers do not look like a bug.
## Things that were wrong in the first draft, found by trying to break it

- **Anyone could call the database functions, even without logging in.** By default Supabase lets anonymous callers run every new database function, and ours run with elevated rights. I revoked those defaults and granted access to signed-in users only, then checked by listing which functions an anonymous caller can run: none.
- **Accepting a bid could use an outdated price.** If a tailor changed their price at the exact moment the customer pressed Accept, the order could be created at the old price while the bid showed the new one. The accept function now locks the bid while it works, so it either sees the new price and refuses ("the bid was revised, please review") or the revision waits until the accept is done.
- **A blocked edit looked like a success.** When the database hides a row from you, an update of it changes zero rows and returns no error. The app now checks that a row actually changed, and shows "this bid can no longer be edited" when none did, instead of pretending the save worked.

## Stretch goal: the tailor profile, and the rest of the extra mile

**The feature.** `/tailors/[id]`: a tailor's average rating, review count, completed orders, and their reviews. Every bid in the customer's list links to it, so a customer can check who they are hiring before pressing Accept.

**Why this one.** The brief requires reviews but never says what they are for; without a place to land they are write-only. Reputation is also the one signal a customer has for choosing between bids, since prices alone say nothing about who will deliver.

**How, and why it matters.** The three numbers come from one database function, `tailor_stats()`, computed from `reviews` and `orders` on each request. There is no rating column anywhere, so nothing can be typed in, drift, or be edited by a tailor; a score only moves by completing an order and being reviewed by its real customer, once. The page says so in one line, because "could a tailor fake it?" is the first question anyone asks.

**Also beyond the brief**, each added because it removes a way to get stuck:

- Up to six reference photos per request, with a gallery and full-screen viewer; the storage rule is checked per photo.
- The AI reads all photos at once, with a visible "looking at your photos" state.
- A database-side AI quota (3 per user per day, 30 overall) so the OpenRouter key cannot be burned.
- Live counts in the navigation (bids awaiting a decision, orders in progress) and "Your bid: pending" on each open request.
- An explicit Edit step on an existing bid, and revision counts visible to the customer.
- A price guard on Accept: the customer accepts the exact terms they saw, or is told the bid changed.

## The first deploy was slow, and the code was not the reason

Signed-in pages on the first Vercel deployment took 2 to 3 seconds to finish, although the first byte arrived in under 100 ms. The response header `x-vercel-id: bom1::iad1::…` explained it: requests entered Vercel's Mumbai edge but the server function ran in Washington, Vercel's default region, while the Supabase project is in Mumbai. A page makes several sequential database and auth calls, and each one was crossing the globe. Pinning the function region to Mumbai (`vercel.json`, `"regions": ["bom1"]`) brought the same pages down to 0.3 to 0.6 seconds with no code change. The lesson for the walkthrough: put the server next to the database, and measure where the time goes before optimising code.

## Protecting the AI key from being burned

Three layers. The key itself never leaves the server (`server-only`, tampering attack 5). The route refuses anonymous callers, photos outside the caller's own folder, more than six images, and more than ten calls a minute from one user on one instance. And `consume_ai_credit()` keeps two counters in the database, per user per day (3) and global per day (30), with no client grants on the tables and the limits fixed inside the function so nothing can be passed in over REST; the route calls it before it spends anything and returns 429 with a plain message when a limit is hit. The hard stop is outside the code: a credit limit on the key in the OpenRouter dashboard.

## Known limits and what I would do next

- The per-minute burst limiter on the AI route is in memory, per server instance; the daily quotas are shared through the database.
- Email confirmations are off so demo accounts work instantly; turning them on needs no schema change.
- Customers cannot edit or cancel a request, and lists are not paginated.
- Tailors can see closed requests in their history only through their own bids; the open-requests list hides them.
- No Arabic/RTL yet; the layout uses logical properties where it was free to, so it is not far off.
