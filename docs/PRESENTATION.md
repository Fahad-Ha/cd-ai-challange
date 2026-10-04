# Presentation plan (20–25 minutes)

## Before the session

- `npm run seed:hosted` the night before. Two accounts, password `demo1234`: `customer@demo.local` and `tailor@demo.local`, with an open request (pending bid), an order in progress with a chat, and a completed, reviewed order. Sign up a second tailor live if you want to show blind bidding with two bidders.
- Two browser profiles open: one as the customer, one as the tailor.
- `docs/TAMPERING.md` open for the expected responses.
- Have the DevTools Network tab visible in the tailor window.

## 1. The demo (5 min): the five attacks, by hand

The panel should watch the server say no. Do the attacks live in DevTools; `docs/TAMPERING.md` has the recorded responses if anything misbehaves on the day.

Setup (once, before the session): in each browser window, log in, open DevTools → Console, paste the contents of `docs/tamper-console.js`, press Enter. It reads your login token from the cookie and gives you one helper, `api(...)`, that calls the Supabase REST API exactly as the app does. It prints the five attack lines so you can copy them.

Suggested order, about a minute each:

1. **Tailor accepts their own bid.** In tailor A's window on the open request, run `document.querySelector('[name=bid_id]').value` to get the bid id, then the Attack 1 line. Red `HTTP 403`, message "Only the request's customer can accept a bid". Reload: still pending.
2. **Tailor reads the competition.** Same window, Attack 2 with the request id from the URL. One row comes back, yours. Then `request_bid_stats`: a count and, with fewer than three bids, nulls. Say why: with two bids the average is the other price.
3. **The trap.** In the customer's window, accept tailor B. Back in tailor A's window, reload: form gone, "this request has closed". Now try the edit anyway: `api('bids?id=eq.<bid id>', ...)` is a GET, so instead show that the Update button no longer exists and the row is frozen: `api('bids?select=status&id=eq.<bid id>')` → `closed`. No flag was copied; the rule reads the parent request.
4. **A stranger in the chat.** Copy the order URL from the customer's window into tailor A's window: 404. Then Attack 3: orders → `[]`, messages → `[]`, POST → `403`. Send a message from the customer's window and show it arrive live in tailor B's window, and nowhere else.
5. **Review too early.** In the customer's window, Attack 4 with the in-progress order: `403`. Advance the order to completed as tailor B, post a review through the UI, then run Attack 4 again: `409`, one review per order.
6. **The key.** In the Sources tab, Ctrl/Cmd+Shift+F, search `sk-or-`. Nothing. Mention the `server-only` import that makes this a build error, not a habit.

If time is short, do 1, 3 and 4.

## 2. The walkthrough (8 min): schema and the decisions behind it

Use `docs/DESIGN.md` as the spine; do not read it.

- One idea: the browser lies, so the app checks nothing and Postgres checks everything. Three mechanisms, each with a one-line job: policies decide which rows exist, column grants decide which columns can be written, locked functions do multi-row transitions.
- The schema in one breath (seven tables, what is derived), then stop on three decisions and tell each as a story:
  1. **The trap.** Show the `bids` UPDATE policy. `request_is_open()` is evaluated at write time. Then the race: revise-just-before-accept and the expected-price check; insert-just-before-accept and the `FOR KEY SHARE` trigger, and why it is not on UPDATE (deadlock with the accept's lock order).
  2. **The aggregate that leaked.** First draft returned min/max and an average with two bids. The test made it obvious. Threshold at three, never min/max, and the honest residual (sum of the other two).
  3. **Defaults that bit.** Anonymous EXECUTE on SECURITY DEFINER functions; the storage policy that let customers read each other's photos; 400 versus 403; `.upsert()` versus column grants. These are the "what I tried that didn't work" the panel asked for.
- Close with the stretch goal in two sentences: the tailor profile is three numbers nobody can type in.

## 3. The teach-back (5 min): row-level security, from the problem

Audience: day one, has never seen RLS. Start from a situation, not a term.

1. **The problem.** "You built a chat. Messages live in a table. The page loads them with `select * from messages where order_id = 42`. Where does that 42 come from?" Let them answer: the URL. "So what happens if I type 43?" Someone will say "you see someone else's chat". Good. "Where would you put the check?" Most will say "in the page code". Draw the page, the API, the database. Then: "I open DevTools and call the API myself. Did your page code run?"
2. **Check for understanding.** "Hands up if the page-code check still protects the data." Pause. Nobody should raise a hand. If someone does, ask them to walk through where the request goes.
3. **The move.** "What if the database itself refused to show rows that aren't yours, no matter who asks or how?" Show one policy, the messages one, in plain words first: "a row exists for you if you are the customer or the tailor on its order". Then the SQL, which is one line longer than the sentence.
4. **The surprise.** "What does a stranger get back: an error, or nothing?" Nothing. "Why is nothing better than an error here?" Because an error tells the attacker the row exists.
5. **Check for understanding, again.** Give them attack 4 (reviews) and ask them to write the rule in words before seeing it. Then show the policy and compare.
6. **One sentence to take home.** "Put the rule next to the data, and the app can only do what the data allows."

Keep the vocabulary for the end: "this is called row-level security, and Supabase lets you write it with one `create policy` statement".

## 4. Q&A: questions I expect, and honest answers

- *"Why not just check the role in the Next.js middleware?"* Middleware runs before the page, not before the API. Proxy here only redirects signed-out visitors for convenience; it is not the boundary.
- *"Isn't SECURITY DEFINER dangerous?"* Yes, which is why each function refuses anonymous callers, locks the parent row, checks the caller against the row, and has its EXECUTE revoked from `anon`. The default Supabase grants would have left them callable with the public key.
- *"Could a tailor still learn a competitor's price?"* With exactly three bids, the sum of the other two. That is the trade-off I chose; the alternative was hiding the aggregate entirely.
- *"What about the service-role key?"* It exists only in the seed and tampering scripts. The app has no admin client at all.
- *"Why is the role not in the JWT?"* A custom access-token hook would do that; it is more setup and the claim only refreshes with the token. One query per request against `profiles` was enough here.
- *"How do you know Realtime respects RLS?"* I subscribed as a non-participant while a participant was also subscribed and counted events: zero against one. I did not take it on faith; doing that also taught me Realtime replays recent inserts to a new subscriber.
- *"Would this scale?"* The policies use `(select auth.uid())` so Postgres evaluates it once per statement, and the subqueries hit indexes. I have not load-tested it. I would start with `explain analyze` on the bids SELECT under a tailor's JWT.
- *"What did you not finish?"* Email confirmation is off for the demo, the AI rate limit is per instance, there is no request cancellation, and no RTL yet.
- Wrong-on-purpose questions (for example "so RLS is like a WHERE clause the frontend adds?"): correct gently by asking where the WHERE clause runs, and who wrote it.
- When asked something I do not know: say so, then name the first thing I would check (the Supabase docs page, the migration file, or a two-line SQL experiment on the local stack).
