# MyTailor Marketplace

A two-sided bespoke-tailoring marketplace: customers post requests (optionally described from a photo by an AI call), tailors bid blind, the customer accepts one bid, and the two of them get a private chat and a linear order pipeline that ends in a review. Built for the CODED Teaching Assistant assessment.

Every access rule is enforced inside Postgres with Supabase row-level security, column grants, triggers, and three locked functions. The app never checks authorization in TypeScript. The evidence is the Tampering Test write-up, `docs/TAMPERING.md`; the reasoning is `docs/DESIGN.md`; the attacks can be repeated by hand with `docs/tamper-console.js`.

## Stack

Next.js 16 (App Router, Server Actions, `proxy.ts`), Tailwind v4, Supabase (Postgres, Auth, Storage, Realtime), OpenRouter for the photo description.

## Run it locally

```bash
npm install
npx supabase start                  # local stack (Docker)
npm run db:reset                    # apply supabase/migrations
cp .env.example .env.local          # then paste the local keys from `npx supabase status`
npm run seed                        # demo customer + tailor, password demo1234
npm run dev
```

Demo accounts: `customer@demo.local` and `tailor@demo.local`, with an open request (pending bid, two reference photos), an order in progress (with chat), and a completed, reviewed order. The photos are freely licensed images from Wikimedia Commons; see `scripts/seed-photos/ATTRIBUTION.md`.

Environment variables (see `.env.example`):

| Name | Where it is used |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The app, in the browser and on the server. Public by design; RLS does the protecting. |
| `SUPABASE_SECRET_KEY` | Only `scripts/seed.mts`, to create the demo accounts. Never referenced by app code. |
| `SUPABASE_DB_URL` | Optional, only for `npx supabase db push --db-url` to the hosted project. |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | Only `src/lib/ai.ts` (`server-only`). Without a key the description falls back to a stub. Usage is capped in the database: 15 descriptions per user per day and 200 per day in total (`supabase/migrations/0011_ai_usage.sql`); set a credit limit on the key in the OpenRouter dashboard as the hard stop. |

## Verifying it

```bash
npm run lint && npx tsc --noEmit && npm run build
```

Then the Tampering Test by hand: log in, open DevTools → Console, paste `docs/tamper-console.js`, and run the five attack lines it prints. Each one calls the Supabase REST API directly with the public key and your own login token; the expected responses are in `docs/TAMPERING.md`.

## Deploy

1. `npx supabase link --project-ref <ref>` then `npx supabase db push` to apply the migrations to the hosted project. In the dashboard, disable email confirmations for demo accounts (Auth → Providers → Email).
2. Push the repo to GitHub, import it in Vercel, and set the three `NEXT_PUBLIC_`/`OPENROUTER_` variables. Do not add the secret key.
3. Add the Vercel URL to Supabase Auth → URL configuration.
4. Point a `.env.hosted` at the project and run `npm run seed:hosted` to create the demo accounts there.

## Where things are

```
supabase/migrations/   0001 privileges · 0002 profiles · 0003 requests · 0004 bids · 0005 orders
                       0006 messages · 0007 reviews · 0008 rpcs (accept/decline/advance) · 0009 storage · 0010 multi-photo · 0011 ai quota
src/lib/supabase/      SSR clients (server, browser, proxy)
src/lib/auth.ts        getProfile / requireRole — role comes from the profiles table, never user_metadata
src/lib/ai.ts          server-only OpenRouter call
src/app/               (auth) · customer/requests · tailor/requests · orders · tailors/[id] · api/describe-photo
src/components/        BidForm, BidStats, BidActions, Chat, StatusStepper, ReviewForm, …
scripts/               seed.mts (demo accounts and data) · seed-photos/ (licensed demo images)
docs/                  TAMPERING.md, DESIGN.md, PRESENTATION.md, tamper-console.js (manual attacks in DevTools)
```
