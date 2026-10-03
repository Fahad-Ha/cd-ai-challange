/**
 * Demo seed. Creates four known accounts and a realistic slice of data by
 * signing in as each user and acting through the public API — the same path
 * the app uses — so RLS is exercised, not bypassed. The secret key is used
 * only to create/delete the auth users.
 *
 *   npm run seed                     (uses .env.local — local stack by default)
 *   npx tsx --env-file=.env.hosted scripts/seed.ts   (hosted project)
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;
if (!url || !publishableKey || !secretKey) throw new Error("Missing Supabase env vars");

const PASSWORD = "demo1234";
const USERS = [
  { email: "customer@demo.local", role: "customer", display_name: "Cara Customer" },
  { email: "tailor.a@demo.local", role: "tailor", display_name: "Amal Atelier" },
  { email: "tailor.b@demo.local", role: "tailor", display_name: "Bader Bespoke" },
  { email: "tailor.c@demo.local", role: "tailor", display_name: "Chaimaa Couture" },
] as const;

const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function resetUsers() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    if (USERS.some((d) => d.email === u.email)) await admin.auth.admin.deleteUser(u.id);
  }
}

async function signedIn(email: string) {
  const c = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return c;
}

function must<T>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (r.error || r.data == null) throw new Error(`${what}: ${r.error?.message ?? "no data"}`);
  return r.data as NonNullable<T>;
}

console.log(`Seeding ${url}`);
await resetUsers();
for (const u of USERS) {
  const { error } = await admin.auth.admin.createUser({
    email: u.email, password: PASSWORD, email_confirm: true,
    user_metadata: { role: u.role, display_name: u.display_name },
  });
  if (error) throw new Error(`create ${u.email}: ${error.message}`);
}

const customer = await signedIn("customer@demo.local");
const tailorA = await signedIn("tailor.a@demo.local");
const tailorB = await signedIn("tailor.b@demo.local");
const tailorC = await signedIn("tailor.c@demo.local");

// 1. An open request with three bids (so the aggregate shows averages). A has revised once.
const r1 = must(await customer.from("requests").insert({
  title: "Navy wool two-piece suit",
  description: "Slim-fit navy suit in mid-weight wool, notch lapel, single vent, for an October wedding.",
}).select("id").single(), "request 1");
const a1 = must(await tailorA.from("bids").insert({ request_id: r1.id, price: 320, turnaround_days: 14, note: "Super 120s wool, two fittings included." }).select("id").single(), "bid A1");
must(await tailorB.from("bids").insert({ request_id: r1.id, price: 410, turnaround_days: 10, note: "Full canvas construction, Italian cloth." }).select("id").single(), "bid B1");
must(await tailorC.from("bids").insert({ request_id: r1.id, price: 290, turnaround_days: 21, note: "Half canvas, one fitting." }).select("id").single(), "bid C1");
must(await tailorA.from("bids").update({ price: 300, note: "Super 120s wool, two fittings included. Price revised.", status: "pending" }).eq("id", a1.id).select("id").single(), "revise A1");

// 2. A request already accepted → order in progress with a short chat.
const r2 = must(await customer.from("requests").insert({
  title: "Linen summer shirt",
  description: "Relaxed white linen shirt, camp collar, mother-of-pearl buttons.",
}).select("id").single(), "request 2");
must(await tailorA.from("bids").insert({ request_id: r2.id, price: 85, turnaround_days: 7, note: "Irish linen." }).select("id").single(), "bid A2");
const b2 = must(await tailorB.from("bids").insert({ request_id: r2.id, price: 95, turnaround_days: 5, note: "Belgian linen, hand-finished buttonholes." }).select("id").single(), "bid B2");
const order2 = must(await customer.rpc("accept_bid", { p_bid_id: b2.id, p_expected_price: 95, p_expected_turnaround: 5 }), "accept B2") as string;
must(await tailorB.rpc("advance_order", { p_order_id: order2, p_expected_status: "accepted" }), "advance order2");
must(await customer.from("messages").insert({ order_id: order2, body: "Hi Bader — can we do a slightly longer hem?" }).select("id").single(), "msg 1");
must(await tailorB.from("messages").insert({ order_id: order2, body: "Of course. I'll add 2 cm and send a photo before stitching." }).select("id").single(), "msg 2");

// 3. A completed, reviewed order so tailor C has a public rating.
const r3 = must(await customer.from("requests").insert({
  title: "Wedding sherwani",
  description: "Ivory raw-silk sherwani with subtle tonal embroidery on the collar and cuffs.",
}).select("id").single(), "request 3");
const c3 = must(await tailorC.from("bids").insert({ request_id: r3.id, price: 540, turnaround_days: 30, note: "Hand embroidery, three fittings." }).select("id").single(), "bid C3");
const order3 = must(await customer.rpc("accept_bid", { p_bid_id: c3.id, p_expected_price: 540, p_expected_turnaround: 30 }), "accept C3") as string;
for (const s of ["accepted", "in_progress", "ready"]) must(await tailorC.rpc("advance_order", { p_order_id: order3, p_expected_status: s }), `advance ${s}`);
must(await customer.from("reviews").insert({ order_id: order3, tailor_id: (await tailorC.auth.getUser()).data.user!.id, rating: 5, comment: "Flawless fit and finish — worth every fils." }).select("id").single(), "review");

console.log("\nDemo accounts (password: demo1234)");
for (const u of USERS) console.log(`  ${u.role.padEnd(8)} ${u.email}  (${u.display_name})`);
console.log(`\nOpen request (3 bids):   ${r1.id}`);
console.log(`Order in progress:       ${order2}`);
console.log(`Completed + reviewed:    ${order3}`);
