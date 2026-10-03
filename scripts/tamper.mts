/**
 * THE TAMPERING TEST — reproducible evidence.
 *
 * Creates throwaway accounts, sets up the exact situations the brief describes,
 * then performs each attack the way an attacker would: with the public key and
 * a real user's JWT, straight against the REST API (raw fetch, so the HTTP
 * status is visible) and Realtime. Prints what was attempted, what came back,
 * and whether the system held. Exits 1 if any attack succeeds.
 *
 *   npm run tamper                         (local stack via .env.local)
 *   npx tsx --env-file=.env.hosted scripts/tamper.ts
 *
 * Attack 5 scans the production client bundle; run `npm run build` first.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;
if (!url || !publishableKey || !secretKey) throw new Error("Missing Supabase env vars");

const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const createdUsers: string[] = [];

interface Actor { id: string; label: string; token: string; client: SupabaseClient }

async function actor(role: "customer" | "tailor", label: string): Promise<Actor> {
  const email = `${label.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}@tamper.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "tamper123", email_confirm: true, user_metadata: { role, display_name: label } });
  if (error || !data.user) throw new Error(`create ${label}: ${error?.message}`);
  createdUsers.push(data.user.id);
  const client = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const s = await client.auth.signInWithPassword({ email, password: "tamper123" });
  if (s.error || !s.data.session) throw new Error(`sign in ${label}: ${s.error?.message}`);
  return { id: data.user.id, label, token: s.data.session.access_token, client };
}

/** Raw REST call as this actor — exactly what the browser's network tab would show. */
async function rest(a: Actor, method: string, path: string, body?: unknown) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${a.token}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, body: parsed };
}

interface Result { n: number; attack: string; attempt: string; response: string; held: boolean }
const results: Result[] = [];
function record(n: number, attack: string, attempt: string, response: string, held: boolean) {
  results.push({ n, attack, attempt, response, held });
  console.log(`\n[${n}] ${attack}\n    attempt : ${attempt}\n    response: ${response}\n    verdict : ${held ? "HELD ✅" : "BROKEN ❌"}`);
}
const short = (b: unknown) => JSON.stringify(b).slice(0, 160);

// ---------------------------------------------------------------- setup
console.log(`Target: ${url}`);
const customer = await actor("customer", "Victim Customer");
const stranger = await actor("customer", "Stranger Customer");
const tailorA = await actor("tailor", "Attacker Tailor");
const tailorB = await actor("tailor", "Honest Tailor");

const req = (await customer.client.from("requests").insert({ title: "Target request", description: "two bids" }).select("id").single()).data!;
const bidA = (await tailorA.client.from("bids").insert({ request_id: req.id, price: 100, turnaround_days: 5, note: "A" }).select("id").single()).data!;
const bidB = (await tailorB.client.from("bids").insert({ request_id: req.id, price: 200, turnaround_days: 3, note: "B's secret price" }).select("id").single()).data!;

const req2 = (await customer.client.from("requests").insert({ title: "Second request", description: "will become an order" }).select("id").single()).data!;
const bidB2 = (await tailorB.client.from("bids").insert({ request_id: req2.id, price: 150, turnaround_days: 4, note: "" }).select("id").single()).data!;
const orderId = (await customer.client.rpc("accept_bid", { p_bid_id: bidB2.id, p_expected_price: 150, p_expected_turnaround: 4 })).data as string;
await customer.client.from("messages").insert({ order_id: orderId, body: "private: my measurements are 42/34" });

try {
  // ---------------------------------------------------------------- 1
  {
    const r = await rest(tailorA, "POST", "rpc/accept_bid", { p_bid_id: bidA.id, p_expected_price: 100, p_expected_turnaround: 5 });
    const after = (await tailorA.client.from("bids").select("status").eq("id", bidA.id).single()).data!;
    record(1, "Accept your own bid as a tailor",
      `POST /rest/v1/rpc/accept_bid {p_bid_id: <my bid>} as Attacker Tailor`,
      `HTTP ${r.status} ${short(r.body)} — bid status afterwards: ${after.status}`,
      r.status === 403 && after.status === "pending");
  }

  // ---------------------------------------------------------------- 2
  {
    const list = await rest(tailorA, "GET", `bids?request_id=eq.${req.id}&select=id,price,note,tailor_id`);
    const direct = await rest(tailorA, "GET", `bids?id=eq.${bidB.id}&select=*`);
    const revs = await rest(tailorA, "GET", `bid_revisions?bid_id=eq.${bidB.id}&select=*`);
    const stats = await rest(tailorA, "POST", "rpc/request_bid_stats", { p_request_id: req.id });
    const listRows = list.body as Array<{ tailor_id: string }>;
    const held = list.status === 200 && listRows.length === 1 && listRows[0].tailor_id === tailorA.id
      && Array.isArray(direct.body) && direct.body.length === 0
      && Array.isArray(revs.body) && revs.body.length === 0
      && stats.status === 200 && (stats.body as Array<{ bid_count: number; avg_price: null }>)[0].avg_price === null;
    record(2, "Fetch another tailor's full bid on a request you're also bidding on",
      `GET /rest/v1/bids?request_id=eq.<request> · GET /rest/v1/bids?id=eq.<B's bid id> · GET /rest/v1/bid_revisions?bid_id=eq.<B's bid id> · POST rpc/request_bid_stats`,
      `list → ${short(list.body)} (only my own row) · direct → HTTP ${direct.status} ${short(direct.body)} · revisions → ${short(revs.body)} · stats → ${short(stats.body)} (2 bids: count only, averages withheld)`,
      held);
  }

  // ---------------------------------------------------------------- 3
  {
    const order = await rest(tailorA, "GET", `orders?id=eq.${orderId}&select=*`);
    const msgs = await rest(tailorA, "GET", `messages?order_id=eq.${orderId}&select=body`);
    const post = await rest(tailorA, "POST", "messages", { order_id: orderId, body: "let me in" });
    const received: string[] = [];
    const ch = tailorA.client.channel(`spy-${orderId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `order_id=eq.${orderId}` }, (p) => received.push((p.new as { body: string }).body));
    await new Promise<void>((res, rej) => ch.subscribe((s, e) => { if (s === "SUBSCRIBED") res(); if (s === "CHANNEL_ERROR") rej(e); }));
    await new Promise((r) => setTimeout(r, 1500));
    await customer.client.from("messages").insert({ order_id: orderId, body: "another private message" });
    await new Promise((r) => setTimeout(r, 4000));
    await tailorA.client.removeAllChannels();
    tailorA.client.realtime.disconnect();
    const held = Array.isArray(order.body) && order.body.length === 0 && Array.isArray(msgs.body) && msgs.body.length === 0 && post.status === 403 && received.length === 0;
    record(3, "Open an order chat you're not part of by changing the order ID",
      `GET /rest/v1/orders?id=eq.<order> · GET /rest/v1/messages?order_id=eq.<order> · POST /rest/v1/messages · Realtime subscribe to messages:order_id=eq.<order>, all as a tailor who lost the bid`,
      `order → ${short(order.body)} (page would 404) · messages → ${short(msgs.body)} · POST → HTTP ${post.status} ${short(post.body)} · realtime events received: ${received.length}`,
      held);
  }

  // ---------------------------------------------------------------- 4
  {
    const early = await rest(customer, "POST", "reviews", { order_id: orderId, tailor_id: tailorB.id, rating: 5, comment: "too early" });
    const foreign = await rest(stranger, "POST", "reviews", { order_id: orderId, tailor_id: tailorB.id, rating: 1, comment: "not my order" });
    const byTailor = await rest(tailorB, "POST", "reviews", { order_id: orderId, tailor_id: tailorB.id, rating: 5, comment: "self review" });
    const held = early.status === 403 && foreign.status === 403 && byTailor.status === 403;
    record(4, "Post a review on an order that isn't completed, or on someone else's order",
      `POST /rest/v1/reviews as the customer (order status: accepted) · as a stranger · as the tailor`,
      `not completed → HTTP ${early.status} ${short(early.body)} · stranger → HTTP ${foreign.status} · tailor → HTTP ${byTailor.status}`,
      held);
  }

  // ---------------------------------------------------------------- 5
  {
    const staticDir = join(process.cwd(), ".next", "static");
    const needles = ["sk-or-", "OPENROUTER_API_KEY", process.env.OPENROUTER_API_KEY].filter((n): n is string => !!n && n.length > 4);
    if (!existsSync(staticDir)) {
      record(5, "Search the client bundle for the AI API key", `scan .next/static for ${needles.map((n) => n.startsWith("sk-or-v1") ? "<the key value>" : n).join(", ")}`, "SKIPPED — run `npm run build` first", false);
    } else {
      const hits: string[] = [];
      const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else { const t = readFileSync(p, "utf8"); for (const n of needles) if (t.includes(n)) hits.push(`${p} contains ${n.startsWith("sk-or-v1") ? "<the key value>" : n}`); } } };
      walk(staticDir);
      record(5, "Search the client bundle for the AI API key",
        `scan every file under .next/static for "sk-or-", "OPENROUTER_API_KEY"${process.env.OPENROUTER_API_KEY ? " and the key value itself" : ""}`,
        hits.length ? hits.join("; ") : "0 matches",
        hits.length === 0);
    }
  }
} finally {
  for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
}

console.log("\n==== TAMPERING TEST SUMMARY ====");
for (const r of results) console.log(`${r.held ? "HELD   " : "BROKEN "} [${r.n}] ${r.attack}`);
const broken = results.filter((r) => !r.held);
console.log(broken.length ? `\n${broken.length} attack(s) succeeded — FAIL` : "\nAll five attacks failed cleanly — PASS");
process.exit(broken.length ? 1 : 0);
