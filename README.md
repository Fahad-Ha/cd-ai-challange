# MyTailor Marketplace

A two-sided bespoke-tailoring marketplace: customers post requests (optionally described from a photo by an AI call), tailors bid blind, the customer accepts one bid, and the two of them get a private chat and a linear order pipeline that ends in a review. Built for the CODED Teaching Assistant assessment.

Every access rule is enforced inside Postgres with Supabase row-level security, column grants, triggers, and three locked functions. The app never checks authorization in TypeScript. The proof is the Tampering Test: `docs/TAMPERING.md`. The reasoning is `docs/DESIGN.md`.

## Stack

Next.js 16 (App Router, Server Actions, `proxy.ts`), Tailwind v4, Supabase (Postgres, Auth, Storage, Realtime), OpenRouter for the photo description, Playwright and `node:test` for tests.

## Run it locally

```bash
npm install
npx supabase start                  # local stack (Docker)
npm run db:reset                    # apply supabase/migrations
cp .env.example .env.local          # then paste the local keys from `npx supabase status`
npm run seed                        # four demo accounts, password demo1234
npm run dev
```

Demo accounts: `customer@demo.local`, `tailor.a@demo.local`, `tailor.b@demo.local`, `tailor.c@demo.local`.

Environment variables (see `.env.example`):

| Name | Where it is used |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The app, in the browser and on the server. Public by design; RLS does the protecting. |
| `SUPABASE_SECRET_KEY` | Only `scripts/seed.mts` and `scripts/tamper.mts`, to create test users. Never referenced by app code. |
| `SUPABASE_DB_URL` | Only `tests/db`, for catalog assertions and the lock-race test. |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | Only `src/lib/ai.ts` (`server-only`). Without a key the description falls back to a stub. |

## Tests and evidence

```bash
npm run test:db     # 54 database tests: every policy, grant, trigger and function (as real signed-in users), catalog checks, a lock-race test
npm run test:e2e    # 22 browser tests across signup, requests, blind bidding, accept, chat, pipeline, reviews, profile
npm run build && npm run tamper   # the five attacks from the brief; exits 1 if any succeeds
npm run lint && npx tsc --noEmit
```

## Deploy

1. `npx supabase link --project-ref <ref>` then `npx supabase db push` to apply the migrations to the hosted project. In the dashboard, disable email confirmations for demo accounts (Auth → Providers → Email).
2. Push the repo to GitHub, import it in Vercel, and set the three `NEXT_PUBLIC_`/`OPENROUTER_` variables. Do not add the secret key.
3. Add the Vercel URL to Supabase Auth → URL configuration.
4. Point a `.env.hosted` at the project and run `npx tsx --env-file=.env.hosted scripts/seed.mts` and `... scripts/tamper.mts` to seed and re-prove the rules in production.

## Where things are

```
supabase/migrations/   0001 privileges · 0002 profiles · 0003 requests · 0004 bids · 0005 orders
                       0006 messages · 0007 reviews · 0008 rpcs (accept/decline/advance) · 0009 storage
src/lib/supabase/      SSR clients (server, browser, proxy)
src/lib/auth.ts        getProfile / requireRole — role comes from the profiles table, never user_metadata
src/lib/ai.ts          server-only OpenRouter call
src/app/               (auth) · customer/requests · tailor/requests · orders · tailors/[id] · api/describe-photo
src/components/        BidForm, BidStats, BidActions, Chat, StatusStepper, ReviewForm, …
scripts/               seed.mts, tamper.mts
tests/db, tests/e2e    database and browser suites
docs/                  TAMPERING.md, DESIGN.md, PRESENTATION.md, ui-options.html, superpowers/specs
```
