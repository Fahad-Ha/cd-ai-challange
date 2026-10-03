# Presentation plan (20–25 minutes)

## Before the session

- `npm run seed` against the project you will demo (hosted for the real thing). Four accounts, password `demo1234`: `customer@demo.local`, `tailor.a@demo.local`, `tailor.b@demo.local`, `tailor.c@demo.local`.
- Two browser profiles open: one as the customer, one as tailor A. A third tab signed in as tailor B.
- A terminal with `npm run tamper` ready to run, and `docs/TAMPERING.md` open.
- Have the DevTools Network tab visible in the tailor window.

## 1. The demo (5 min): the five attacks

Lead with the evidence, use the UI only to make it concrete.

1. Run `npm run tamper` live. While it runs (about ten seconds), say what it is: throwaway accounts, raw REST calls with the public key and a real JWT, the same thing a curious student with DevTools would try. Read the five verdicts off the summary.
2. Pick one attack and do it by hand so it is not "a script says so":
   - As tailor A on the open request, open DevTools, copy the `bids` request from the Network tab, change the filter to the request id with no tailor filter, resend. One row comes back: your own. Point at the aggregate card: "This is all a tailor ever sees of the competition, and only once three bids exist. With two, the average is the other tailor's price in disguise."
3. As the customer, accept tailor B. Switch to tailor A's tab, reload: bid frozen, form gone, "this request has closed". Try the edit anyway in DevTools: zero rows. "No flag was copied onto the bid. The policy reads the parent request."
4. Open the order as the customer, send a message, show it arrive live for tailor B. Paste the order URL into tailor A's tab: 404.

If time is short, do steps 1 and 3 only.

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
- *"How do you know Realtime respects RLS?"* The tamper script subscribes as a non-participant and counts events: zero. I did not take it on faith; the first version of that test also taught me Realtime replays recent inserts to a new subscriber.
- *"Would this scale?"* The policies use `(select auth.uid())` so Postgres evaluates it once per statement, and the subqueries hit indexes. I have not load-tested it. I would start with `explain analyze` on the bids SELECT under a tailor's JWT.
- *"What did you not finish?"* Email confirmation is off for the demo, the AI rate limit is per instance, there is no request cancellation, and no RTL yet.
- Wrong-on-purpose questions (for example "so RLS is like a WHERE clause the frontend adds?"): correct gently by asking where the WHERE clause runs, and who wrote it.
- When asked something I do not know: say so, then name the first thing I would check (the Supabase docs page, the migration file, or a two-line SQL experiment on the local stack).
