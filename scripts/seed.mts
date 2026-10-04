/**
 * Demo seed: one customer, one tailor, and three stories between them:
 *   1. an open request with the tailor's pending bid   (accept it live)
 *   2. an order in progress with a short chat           (advance it live)
 *   3. a completed, reviewed order                      (the rating shows on the tailor's profile)
 *
 * The two accounts are created through the Auth admin API (secret key); the
 * requests, photos and bids are created by signing in as each user and acting
 * through the public API, so the same RLS rules apply as in the app. Photos
 * come from scripts/seed-photos (see ATTRIBUTION.md there).
 *
 *   npm run seed            # local stack  (.env.local)
 *   npm run seed:hosted     # hosted project (.env.hosted)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PHOTO_DIR = join(dirname(fileURLToPath(import.meta.url)), "seed-photos");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;
if (!url || !publishableKey || !secretKey) throw new Error("Missing Supabase env vars");

const PASSWORD = "demo1234";
const CUSTOMER = { email: "customer@demo.local", role: "customer", display_name: "Cara Customer" } as const;
const TAILOR = { email: "tailor@demo.local", role: "tailor", display_name: "Amal Atelier" } as const;

const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function removeDemoAccounts() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    if (!u.email?.endsWith("@demo.local")) continue;
    const { data: files } = await admin.storage.from("reference-photos").list(u.id);
    if (files?.length) await admin.storage.from("reference-photos").remove(files.map((f) => `${u.id}/${f.name}`));
    await admin.auth.admin.deleteUser(u.id);
  }
}

async function createAndSignIn(u: typeof CUSTOMER | typeof TAILOR) {
  const { error } = await admin.auth.admin.createUser({
    email: u.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role: u.role, display_name: u.display_name },
  });
  if (error) throw new Error(`create ${u.email}: ${error.message}`);
  const client = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email: u.email, password: PASSWORD });
  if (signIn.error) throw new Error(`sign in ${u.email}: ${signIn.error.message}`);
  return client;
}

async function userId(client: SupabaseClient, who: string) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error(`${who} id: ${error?.message ?? "no user"}`);
  return data.user.id;
}

function must<T>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (r.error || r.data == null) throw new Error(`${what}: ${r.error?.message ?? "no data"}`);
  return r.data as NonNullable<T>;
}

console.log(`Seeding ${url}`);
await removeDemoAccounts();
const customer = await createAndSignIn(CUSTOMER);
const tailor = await createAndSignIn(TAILOR);

const customerId = await userId(customer, "customer");

/** Upload seed photos as the customer (storage RLS applies) and return their paths. */
async function uploadPhotos(files: string[]) {
  const paths: string[] = [];
  for (const file of files) {
    const path = `${customerId}/seed-${file}`;
    const { error } = await customer.storage.from("reference-photos").upload(path, readFileSync(join(PHOTO_DIR, file)), { contentType: "image/jpeg" });
    if (error) throw new Error(`upload ${file}: ${error.message}`);
    paths.push(path);
  }
  return paths;
}

async function requestWithBid(title: string, description: string, photos: string[], price: number, days: number, note: string) {
  const photo_paths = await uploadPhotos(photos);
  const request = must(await customer.from("requests").insert({ title, description, photo_paths }).select("id").single(), `request: ${title}`);
  const bid = must(
    await tailor.from("bids").insert({ request_id: request.id, price, turnaround_days: days, note }).select("id").single(),
    `bid on ${title}`,
  );
  return { requestId: request.id as string, bidId: bid.id as string, price, days };
}

async function acceptedOrder(r: Awaited<ReturnType<typeof requestWithBid>>) {
  return must(
    await customer.rpc("accept_bid", { p_bid_id: r.bidId, p_expected_price: r.price, p_expected_turnaround: r.days }),
    "accept bid",
  ) as string;
}

// 1. Open request, pending bid.
const open = await requestWithBid(
  "Navy wool two-piece suit",
  "Slim-fit navy suit in mid-weight wool, notch lapel, single vent, for an October wedding. Two reference photos attached.",
  ["suit-1.jpg", "suit-2.jpg"], 320, 14, "Super 120s wool, two fittings included.",
);

// 2. Order in progress with a chat.
const shirt = await requestWithBid("Linen summer shirt", "Relaxed white linen shirt, camp collar, mother-of-pearl buttons.", ["shirt-1.jpg", "shirt-2.jpg"], 95, 5, "Belgian linen, hand-finished buttonholes.");
const inProgress = await acceptedOrder(shirt);
must(await tailor.rpc("advance_order", { p_order_id: inProgress, p_expected_status: "accepted" }), "start work");
must(await customer.from("messages").insert({ order_id: inProgress, body: "Hi Amal — could the hem be a little longer?" }).select("id").single(), "message 1");
must(await tailor.from("messages").insert({ order_id: inProgress, body: "Of course. I'll add 2 cm and send a photo before stitching." }).select("id").single(), "message 2");

// 3. Completed and reviewed.
const sherwani = await requestWithBid("Wedding sherwani", "Ivory raw-silk sherwani with tonal embroidery on the collar and cuffs.", ["sherwani-1.jpg"], 540, 30, "Hand embroidery, three fittings.");
const completed = await acceptedOrder(sherwani);
for (const step of ["accepted", "in_progress", "ready"]) {
  must(await tailor.rpc("advance_order", { p_order_id: completed, p_expected_status: step }), `advance from ${step}`);
}
const tailorId = await userId(tailor, "tailor");
must(
  await customer.from("reviews").insert({ order_id: completed, tailor_id: tailorId, rating: 5, comment: "Flawless fit and finish, delivered a week early." }).select("id").single(),
  "review",
);

console.log(`
Demo accounts (password: ${PASSWORD})
  customer  ${CUSTOMER.email}  (${CUSTOMER.display_name})
  tailor    ${TAILOR.email}    (${TAILOR.display_name})

Open request, pending bid:   ${open.requestId}
Order in progress (chat):    ${inProgress}
Completed + reviewed order:  ${completed}
`);
