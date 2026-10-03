# MyTailor Marketplace — Build Plan

## Context

CODED Teaching Assistant assessment, Part 1. Build a two-sided tailoring marketplace (customers post requests, tailors bid blind, customer accepts one bid, order pipeline + scoped chat + review) in Next.js + Supabase, deploy to Vercel, and prove every access rule holds **server-side** via the five-attack Tampering Test. Deliverables: deployed link, repo, two write-ups (tampering results + schema/access-control justification), and presentation prep (demo script, walkthrough, teach-back, Q&A). Deadline: one week from the email.

Working directory `/Users/fahadah/Development/coded-ai-challange` is empty. Node 24, npm, git, Docker installed; Supabase CLI and Vercel CLI run via `npx`.

**Decisions made with the user**
- Stretch goal: **tailor public profile** (`/tailors/[id]`) with average rating, review count, completed-order count, derived server-side.
- Scope: build + two write-ups + presentation prep (`docs/PRESENTATION.md`).
- **UI style gate**: before any frontend code, present three visual directions as one HTML comparison page; user picks.
- Supabase hosted project exists: `https://zthrdbbunspivagzwdjd.supabase.co` (ref `zthrdbbunspivagzwdjd`). User enters publishable/anon key, DB password (for `supabase link`) and secret key (scripts only) into `.env.local`, never in chat. OpenRouter key, Vercel, GitHub still to be provisioned; AI call degrades to a stub when no key is set.

**Interpretation of "Supabase tables + RLS, not raw SQL"**: every access rule lives inside Postgres (RLS policies, column grants, triggers, SECURITY DEFINER functions for multi-row transitions). The app never enforces authorization in TypeScript. Schema is versioned as Supabase migration files because that's the reproducible way to define tables + policies.

---

## Architecture in one paragraph

Next.js 16 App Router (TypeScript, Tailwind v4, shadcn/ui). Every page and Server Action talks to Supabase with the **user's own JWT** via `@supabase/ssr`, so RLS applies to everything. No secret/service-role key in the app; it is used only by local scripts. Reads are table selects under RLS. Single-row writes that teach RLS well (place/revise bid, send message, post review) are direct inserts/updates under RLS. Multi-row state transitions (accept bid, decline bid, advance order) are Postgres RPCs that check `auth.uid()` and run atomically with row locks. State machines are additionally enforced by BEFORE UPDATE triggers so they hold for every writer. The AI image-description call is a Route Handler reading a server-only env var.

**Where each rule lives** (the map the panel will ask for):

| Rule | Enforced by |
|---|---|
| One role per account, immutable | `profiles.role` set once by trigger from signup metadata; UPDATE grant covers `display_name` only; app reads role from `profiles`, never from `user_metadata` |
| Tailors never see competitor bids | `bids` SELECT policy: own bid OR owner of request. Aggregate via `request_bid_stats()`: count always, averages only when ≥3 bids, no min/max |
| Bid editable only while request open | `bids` UPDATE policy calls `request_is_open(request_id)` — reads the **parent request's status**, no flag on the bid |
| Every revision logged | AFTER INSERT/UPDATE trigger on `bids` → `bid_revisions` |
| Accept closes request, freezes others, creates order atomically | `accept_bid()` RPC: `FOR UPDATE` on request, state-predicated UPDATEs, one transaction |
| Only the customer can accept/decline | RPCs compare `auth.uid()` to `requests.customer_id`; raise `42501` → HTTP 403 |
| Chat scoped to the order's two participants | `messages` policies via `is_order_participant()`; Realtime evaluates the same RLS per subscriber |
| Linear order pipeline, tailor only | `advance_order()` RPC + `enforce_order_transition` trigger; no UPDATE grant on `orders` |
| Customer-only review, once, only when completed | `reviews` INSERT policy joins `orders` on customer, tailor, `status='completed'`; `UNIQUE(order_id)` |
| AI key not in client bundle | `OPENROUTER_API_KEY` read only in a `server-only` module used by `app/api/describe-photo/route.ts` |

---

## Schema (all tables RLS-enabled, `to authenticated` policies, `anon` has no grants)

```
profiles       id (= auth.users.id) · role ('customer'|'tailor') · display_name · created_at
requests       id · customer_id default auth.uid() → profiles · title · description · photo_path?
               · status ('open'|'closed') · created_at · closed_at?
               CHECK: open ⇒ closed_at null; closed ⇒ closed_at not null
bids           id · request_id → requests · tailor_id default auth.uid() → profiles
               · price numeric(10,2) >0 · turnaround_days int >0 · note
               · status ('pending'|'declined'|'accepted'|'closed') · created_at · updated_at
               UNIQUE(request_id, tailor_id)
bid_revisions  id · bid_id → bids · revision_no · price · turnaround_days · note · status · created_at
               UNIQUE(bid_id, revision_no)
orders         id · request_id UNIQUE · bid_id UNIQUE · customer_id · tailor_id
               · price · turnaround_days (snapshot at acceptance)
               · status ('accepted'|'in_progress'|'ready'|'completed') · created_at · updated_at · completed_at?
messages       id · order_id → orders · sender_id default auth.uid() · body (1..2000) · created_at
reviews        id · order_id UNIQUE → orders · customer_id default auth.uid() · tailor_id · rating 1..5 · comment · created_at
```

No `requests.accepted_bid_id` (circular FK; `orders.bid_id` + `bids.status='accepted'` already encode it).

Storage: private bucket `reference-photos` (5 MB, jpeg/png/webp), objects at `{auth.uid()}/{uuid}.{ext}`.

Derived, never stored: bid aggregate, tailor rating/review count/completed orders, "is request open".

---

## Access-control set (final, post-review)

**Privilege baseline** (`0001_privileges.sql`): `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM public, anon;` same for tables/sequences from `anon`. Each table: `REVOKE ALL FROM anon, authenticated` then explicit grants. Each function: `REVOKE EXECUTE FROM public, anon; GRANT EXECUTE TO authenticated`.

**Function conventions**: `SET search_path = ''` (fully-qualified names), `(select auth.uid())` in policies, first line of every RPC `IF (select auth.uid()) IS NULL THEN RAISE ... USING ERRCODE='42501'`. Authorization failures raise `42501` (→403); state failures raise `P0001` (→400); same generic message for "not found" and "not yours" (no id oracle).

| Table | Grants (authenticated) | SELECT | INSERT (with check) | UPDATE |
|---|---|---|---|---|
| profiles | select; update(display_name) | all rows | — (trigger) | own row |
| requests | select; insert(title, description, photo_path) | own OR `my_role()='tailor'` | `my_role()='customer'` AND own AND `status='open'` AND photo_path null or under own folder | — |
| bids | select; insert(request_id, price, turnaround_days, note); update(price, turnaround_days, note, status) | own OR request owner | `my_role()='tailor'` AND own AND `status='pending'` AND `request_is_open()` | USING own AND status∈(pending,declined) AND open; WITH CHECK own AND `status='pending'` AND open |
| bid_revisions | select | parent bid visible (subquery through `bids`) | — (DEFINER trigger) | — |
| orders | select | customer or tailor of order | — (RPC) | — (RPC) |
| messages | select; insert(order_id, body) | `is_order_participant()` | own sender AND participant | — |
| reviews | select; insert(order_id, tailor_id, rating, comment) | all rows | own AND EXISTS order (same customer, same tailor, completed) | — |
| storage.objects | — | bucket match AND (own folder OR `my_role()='tailor'`) | bucket match AND own folder | — |

**Helpers** (DEFINER, STABLE): `my_role()`, `request_is_open(uuid)`, `is_order_participant(uuid)`, `request_bid_stats(uuid) → (bid_count, avg_price?, avg_turnaround?)` (tailor or request owner only; averages null below 3 bids), `tailor_stats(uuid) → (avg_rating, review_count, completed_orders)`.

**RPCs** (DEFINER, VOLATILE):
- `accept_bid(p_bid_id, p_expected_price, p_expected_turnaround) → order_id`: lock request `FOR UPDATE`; caller = customer; request open; re-read bid: pending and matches expected price/turnaround (else "bid was revised, please review"); `UPDATE bids SET status='accepted' WHERE id=… AND status='pending'` + `IF NOT FOUND` raise; siblings pending/declined → closed; request → closed + closed_at; INSERT order with price snapshot.
- `decline_bid(p_bid_id)`: lock request; caller = customer; open; `… WHERE status='pending'` + FOUND check.
- `advance_order(p_order_id, p_expected_status) → new_status`: lock order; caller = tailor; current = expected (double-click safe); next step; set `completed_at` on completed.

**Triggers**
- `on_auth_user_created` → `handle_new_user()` (DEFINER): role from `coalesce(raw_user_meta_data->>'role','')`, invalid → 'customer'; display_name from metadata with neutral fallback (never email).
- `bids_assert_request_open` BEFORE INSERT (DEFINER): `PERFORM … FROM requests WHERE id=new.request_id AND status='open' FOR KEY SHARE` → closes the insert-vs-accept race. **Not** on UPDATE (deadlock with accept_bid's lock order).
- `enforce_bid_transition`, `enforce_order_transition`, `enforce_request_transition` BEFORE UPDATE (INVOKER): allowed pairs exactly per the brief's state diagrams.
- `log_bid_revision` AFTER INSERT OR UPDATE (DEFINER): on insert, or when price/turnaround/note changed, or declined→pending. Not on accept/close flips.
- `set_updated_at` on bids, orders.

Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;` only.

Indexes: `requests(customer_id)`, `requests(status) WHERE status='open'`, `bids(tailor_id)`, `bid_revisions(bid_id, revision_no)`, `orders(customer_id)`, `orders(tailor_id)`, `messages(order_id, created_at)`, `reviews(tailor_id)`.

**App-layer rules that back the DB** (not authorization, but needed for "fails cleanly"): server actions use `.select('id').maybeSingle()` and treat `null` as "no longer editable"; revise always sends `status:'pending'`; never `.upsert()` on bids (column grants break `ON CONFLICT DO UPDATE`); signup action validates role before `signUp`.

---

## Tampering Test map (what `scripts/tamper.ts` asserts)

| # | Attack (logged in with the real anon key) | Guard | Expected clean failure |
|---|---|---|---|
| 1 | Tailor calls `rpc('accept_bid', {p_bid_id: own, …})` | `accept_bid` caller check, errcode 42501 | HTTP 403, "Only the request's customer can accept a bid"; row unchanged |
| 2 | Tailor A selects `bids` for a request B also bid on; also `bid_revisions`; also `request_bid_stats` with 2 bids | `bids` SELECT policy; revisions inherit; averages null <3 | Only A's rows; filtering by B's id → `[]`; stats show count only |
| 3 | Non-participant opens `/orders/{id}`, selects `messages`, inserts a message, subscribes via Realtime | `orders`/`messages` policies; Realtime applies RLS per subscriber | Page 404; select `[]`; insert 42501 (403); no realtime events |
| 4 | Customer reviews own non-completed order; reviews someone else's order; tailor reviews; second review on completed order | `reviews` INSERT policy; `UNIQUE(order_id)` | 42501 ×3; 23505 (409) for the duplicate |
| 5 | `grep -r "OPENROUTER\|sk-or-" .next/static` after `next build`; also import the AI module from a client component | key only in `server-only` module | zero matches; client import is a build error |

---

## Project layout

```
mytailor/
  supabase/
    config.toml                      [auth.email] enable_confirmations = false (local)
    migrations/
      0001_privileges.sql            default-privilege revokes, set_updated_at()
      0002_profiles.sql              table, grants, policies, handle_new_user + trigger, my_role()
      0003_requests.sql              table, CHECK, transition trigger, grants, policies, request_is_open(), indexes
      0004_bids.sql                  bids + bid_revisions, 4 triggers, grants, column grants, policies, indexes
      0005_orders.sql                table, transition trigger, is_order_participant(), grants, policy, indexes
      0006_messages.sql              table, grants, policies, index, realtime publication
      0007_reviews.sql               table, grants, policy, index
      0008_rpcs.sql                  accept_bid, decline_bid, advance_order, request_bid_stats, tailor_stats + grants
      0009_storage.sql               bucket row + storage.objects policies
  src/
    proxy.ts                         Next 16 convention: session refresh + redirect unauthenticated → /login
    lib/supabase/{server.ts,client.ts,proxy.ts}   @supabase/ssr (getAll/setAll)
    lib/auth.ts                      getProfile(): reads profiles (never user_metadata)
    lib/types.ts                     `supabase gen types`
    lib/ai.ts                        `import 'server-only'`; describePhoto(bytes, mime); stub when no key
    app/
      layout.tsx · page.tsx (redirect by role) · globals.css (design tokens from chosen style)
      (auth)/login · (auth)/signup (+ actions.ts)
      customer/requests · customer/requests/new · customer/requests/[id]
      tailor/requests · tailor/requests/[id]
      orders · orders/[id]
      tailors/[id]                   stretch
      api/describe-photo/route.ts
    components/                      shadcn primitives + Chat.tsx (client, realtime), BidForm, StatusStepper, RatingStars
  scripts/
    seed.ts        secret key, local/hosted: 1 customer, 3 tailors, request with 3 bids, one accepted order
    tamper.ts      anon key + real logins: 5 attacks, PASS/FAIL table, non-zero exit on any unexpected success
    check-bundle.sh  grep .next/static for key
  docs/
    ui-options.html  Phase 2a comparison page (3 directions, same screen)
    TAMPERING.md · DESIGN.md · PRESENTATION.md
  README.md · .env.example
```

Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (vision-capable default, confirmed at implementation), scripts only `SUPABASE_SECRET_KEY`.

---

## Build phases (each ends with a runnable check)

### Phase 0 — Scaffold & link (Day 1)
1. `npx create-next-app@latest` (TS, Tailwind, App Router, src dir, eslint); `npx shadcn@latest init`.
2. `git init`; `.gitignore` covers `.env*.local`, `supabase/.temp`. Commit the design sections of this plan as `docs/superpowers/specs/2026-10-03-mytailor-design.md`.
3. `npx supabase init`; `npx supabase start` (local Docker stack); `npx supabase link --project-ref zthrdbbunspivagzwdjd` (user supplies DB password via prompt).
4. Hosted dashboard (user): Auth → disable email confirmations.
5. `.env.example` + user fills `.env.local`.
Check: `npm run dev` renders; `npx supabase status` prints local URLs.

### Phase 1 — Database first (Day 1–2)
Migrations 0001–0009; `npx supabase db reset` applies cleanly; `npx supabase gen types typescript --local > src/lib/types.ts`; `scripts/seed.ts`; `scripts/tamper.ts`.
Check: **all 5 tampering checks PASS against the local DB before any UI exists**, then `npx supabase db push` to hosted and re-run. This is the headline of the presentation.

### Phase 2a — UI style gate (user decision)
Build `docs/ui-options.html`: three directions rendered on the same sample screen (tailor request page: request card, my-bid form, aggregate card "averages unlock at 3 bids", status badge), side by side with a mobile column. Candidates: (1) atelier/editorial — warm neutrals, serif display, generous whitespace; (2) workshop/utility — dense, high-contrast, mono accents; (3) soft marketplace — rounded, friendly, colour-coded roles. Use the `frontend-design` skill. **STOP for the user's pick** before 2b. Chosen direction → tokens in `globals.css` + shadcn theme.

### Phase 2b — Auth & shell (Day 2)
`@supabase/ssr` clients, `proxy.ts`, signup with role select (metadata `{role, display_name}`, validated server-side), login/logout, role redirect, nav.
Check: two browsers land on different dashboards; `updateUser({data:{role:'tailor'}})` from devtools changes nothing.

### Phase 3 — Requests + AI (Day 3)
New-request form: upload to `reference-photos/{uid}/…`, call `/api/describe-photo` with the path, prefill editable description. Route: `getUser()` → 401; assert `path.startsWith(user.id+'/')`; download with the user's client (storage RLS applies); base64 data URL → OpenRouter chat completion; small in-memory per-user limiter; stub text when no key. Request detail renders a signed URL (short TTL) created with the viewer's client.
Check: round trip works; unauthenticated POST → 401; another user's path → 403.

### Phase 4 — Bidding (Day 3–4)
Tailor request page: my bid (insert/update under RLS, revise sends `status:'pending'`), aggregate card via `request_bid_stats`, revision count. Customer request page: bids with revision timeline count, Accept (passes expected price/turnaround → `accept_bid` → redirect to order), Decline.
Check: B's bid invisible to A in UI and devtools; after accept, A's edit returns "no longer editable"; aggregate hides averages until the third bid.

### Phase 5 — Orders, chat, reviews, profile (Day 4–5)
Order page: stepper, Advance (tailor, passes expected status), Chat (initial fetch under RLS, insert, `postgres_changes` INSERT filtered by `order_id`), review form (customer, completed only), link to tailor profile. `/tailors/[id]`: `tailor_stats` + recent reviews.
Check: realtime across two browsers; non-participant URL → 404; review before completion → clean error.

### Phase 6 — Evidence & docs (Day 5–6)
Run `tamper.ts` against hosted; capture output + devtools screenshots → `docs/TAMPERING.md` (per attack: attempt, exact request, exact response, which rule stopped it). `docs/DESIGN.md`: schema rationale, each rule, what breaks without it, war stories (aggregate leak at n=2, insert race, column grants vs upsert, 400-vs-403 error codes, role in user_metadata). `docs/PRESENTATION.md`: 5-min demo script, 8-min walkthrough, 5-min teach-back on RLS starting from "the client is lying to you", likely Q&A.

### Phase 7 — Deploy (Day 6)
GitHub repo → Vercel import → env vars (no key under `NEXT_PUBLIC_`) → Supabase Auth redirect allow-list → deploy → re-run tamper script against production → smoke test.

---

## Verification

- **Automated**: `npm run tamper` (5 attacks, exit code), `npm run build && npm run check-bundle`, `npm run lint`, `tsc --noEmit`, `npx supabase db reset` clean.
- **Manual demo path** (= presentation script): signup customer + 3 tailors → request with photo → AI description → 3 bids, tailor A revises twice → A sees own bid + count, averages appear at bid 3 → customer declines A, A revises (declined→pending) → customer accepts B → request closed, A's edit blocked → chat customer↔B only → B advances to completed → customer reviews → B's profile shows rating.

## Review notes (from adversarial review, adopted)
Anon EXECUTE on functions revoked; storage read narrowed to own folder/tailor; aggregate thresholded at 3 bids, min/max dropped; role never read from `user_metadata`; accept/decline lock the request and predicate every UPDATE; expected price/turnaround on accept; 42501 for auth failures; BEFORE INSERT `FOR KEY SHARE` guard on bids; transition triggers on three tables; insert column grants + `default auth.uid()`; `accepted_bid_id` dropped; `server-only` on the AI module; `maybeSingle()` null handling. Rejected as over-engineering: custom access-token hook, private schema, Broadcast channels, Redis rate limiting.

## Open assumptions
- Email/password auth, confirmations off for the demo.
- With exactly 3 bids a tailor can compute the sum of the other two; accepted and documented as a trade-off.
- Tailors can see closed requests (they know the outcome from their own bid status anyway).
