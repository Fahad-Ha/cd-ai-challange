import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createUser, cleanupUsers, expectCode, type TestUser } from "./helpers.ts";

let customer: TestUser;
let otherCustomer: TestUser;
let tailorA: TestUser;
let tailorB: TestUser;
let tailorC: TestUser;
let requestId: string;
let bidA: string;
let bidB: string;
let orderId: string;

async function newRequestWithBids(title: string) {
  const req = await customer.client.from("requests").insert({ title, description: "d" }).select("id").single();
  const a = await tailorA.client.from("bids").insert({ request_id: req.data!.id, price: 100, turnaround_days: 5, note: "A" }).select("id").single();
  const b = await tailorB.client.from("bids").insert({ request_id: req.data!.id, price: 200, turnaround_days: 3, note: "B" }).select("id").single();
  return { requestId: req.data!.id as string, bidA: a.data!.id as string, bidB: b.data!.id as string };
}

before(async () => {
  customer = await createUser("customer", "Customer");
  otherCustomer = await createUser("customer", "Other customer");
  tailorA = await createUser("tailor", "Tailor A");
  tailorB = await createUser("tailor", "Tailor B");
  tailorC = await createUser("tailor", "Tailor C");
  ({ requestId, bidA, bidB } = await newRequestWithBids("Wedding suit"));
});
after(cleanupUsers);

test("TAMPER 1: a tailor cannot accept their own bid", async () => {
  const { error } = await tailorA.client.rpc("accept_bid", { p_bid_id: bidA, p_expected_price: 100, p_expected_turnaround: 5 });
  expectCode(error, "42501", "tailor self-accept");
  const bid = await tailorA.client.from("bids").select("status").eq("id", bidA).single();
  assert.equal(bid.data?.status, "pending");
});

test("another customer cannot accept a bid on a request they do not own", async () => {
  const { error } = await otherCustomer.client.rpc("accept_bid", { p_bid_id: bidB, p_expected_price: 200, p_expected_turnaround: 3 });
  expectCode(error, "42501", "foreign accept");
});

test("accepting with a stale price is refused (the tailor revised under the customer)", async () => {
  const { error } = await customer.client.rpc("accept_bid", { p_bid_id: bidB, p_expected_price: 150, p_expected_turnaround: 3 });
  expectCode(error, "P0001", "stale price");
  assert.match(error!.message, /revised/i);
});

test("accepting a bid closes the request, freezes the others, and creates the order — atomically", async () => {
  const { data, error } = await customer.client.rpc("accept_bid", { p_bid_id: bidB, p_expected_price: 200, p_expected_turnaround: 3 });
  assert.equal(error, null);
  orderId = data as string;

  const req = await customer.client.from("requests").select("status, closed_at").eq("id", requestId).single();
  assert.equal(req.data?.status, "closed");
  assert.ok(req.data?.closed_at);

  const b = await tailorB.client.from("bids").select("status").eq("id", bidB).single();
  assert.equal(b.data?.status, "accepted");
  const a = await tailorA.client.from("bids").select("status").eq("id", bidA).single();
  assert.equal(a.data?.status, "closed");

  const order = await customer.client.from("orders").select("status, price, turnaround_days, customer_id, tailor_id, bid_id").eq("id", orderId).single();
  assert.deepEqual(order.data, { status: "accepted", price: 200, turnaround_days: 3, customer_id: customer.id, tailor_id: tailorB.id, bid_id: bidB });
});

test("THE TRAP: a bid becomes uneditable the instant its request closes (state comes from the parent)", async () => {
  const { data, error } = await tailorA.client.from("bids").update({ price: 1, status: "pending" }).eq("id", bidA).select("id");
  assert.equal(error, null);
  assert.deepEqual(data, []); // zero rows: the USING clause reads requests.status
  const a = await tailorA.client.from("bids").select("price, status").eq("id", bidA).single();
  assert.deepEqual(a.data, { price: 100, status: "closed" });

  const late = await tailorC.client.from("bids").insert({ request_id: requestId, price: 50, turnaround_days: 1, note: "late" });
  expectCode(late.error, "42501", "bid on closed request");
});

test("a request cannot be accepted twice", async () => {
  const { error } = await customer.client.rpc("accept_bid", { p_bid_id: bidA, p_expected_price: 100, p_expected_turnaround: 5 });
  expectCode(error, "P0001", "second accept");
});

test("decline → revise → pending: customer declines, tailor revises, bid is pending again", async () => {
  const r = await newRequestWithBids("Overcoat");
  const tailorDecline = await tailorA.client.rpc("decline_bid", { p_bid_id: r.bidA });
  expectCode(tailorDecline.error, "42501", "tailor declines");

  const { error } = await customer.client.rpc("decline_bid", { p_bid_id: r.bidA });
  assert.equal(error, null);
  const a = await tailorA.client.from("bids").select("status").eq("id", r.bidA).single();
  assert.equal(a.data?.status, "declined");

  const again = await customer.client.rpc("decline_bid", { p_bid_id: r.bidA });
  expectCode(again.error, "P0001", "decline a declined bid");

  const revise = await tailorA.client.from("bids").update({ price: 90, status: "pending" }).eq("id", r.bidA).select("status").single();
  assert.equal(revise.error, null);
  assert.equal(revise.data?.status, "pending");
  const revs = await tailorA.client.from("bid_revisions").select("revision_no, status").eq("bid_id", r.bidA).order("revision_no");
  assert.deepEqual(revs.data, [{ revision_no: 1, status: "pending" }, { revision_no: 2, status: "pending" }]);
});

test("orders are visible only to their two participants", async () => {
  const c = await customer.client.from("orders").select("id").eq("id", orderId);
  assert.equal(c.data?.length, 1);
  const b = await tailorB.client.from("orders").select("id").eq("id", orderId);
  assert.equal(b.data?.length, 1);
  const a = await tailorA.client.from("orders").select("id").eq("id", orderId);
  assert.deepEqual(a.data, []);
  const o = await otherCustomer.client.from("orders").select("id").eq("id", orderId);
  assert.deepEqual(o.data, []);
});

test("CHAT: both participants can write and read; the losing tailor and strangers get nothing", async () => {
  const m1 = await customer.client.from("messages").insert({ order_id: orderId, body: "Hi, when can we start?" }).select("id").single();
  assert.equal(m1.error, null);
  const m2 = await tailorB.client.from("messages").insert({ order_id: orderId, body: "Tomorrow morning." }).select("id").single();
  assert.equal(m2.error, null);

  const view = await tailorB.client.from("messages").select("body").eq("order_id", orderId).order("created_at");
  assert.deepEqual(view.data?.map((m) => m.body), ["Hi, when can we start?", "Tomorrow morning."]);

  // TAMPER 3: change the order id
  const peek = await tailorA.client.from("messages").select("body").eq("order_id", orderId);
  assert.equal(peek.error, null);
  assert.deepEqual(peek.data, []);
  const inject = await tailorA.client.from("messages").insert({ order_id: orderId, body: "let me in" });
  expectCode(inject.error, "42501", "non-participant message");
  const spoof = await customer.client.from("messages").insert({ order_id: orderId, body: "x", sender_id: tailorB.id });
  expectCode(spoof.error, "42501", "spoofed sender");
});

test("CHAT via Realtime: a non-participant subscription receives no events for the order", async () => {
  const received: string[] = [];
  const spyChannel = tailorA.client
    .channel(`spy-${orderId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `order_id=eq.${orderId}` }, (p) => received.push(`spy:${(p.new as { body: string }).body}`));
  const legitChannel = tailorB.client
    .channel(`legit-${orderId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `order_id=eq.${orderId}` }, (p) => received.push(`legit:${(p.new as { body: string }).body}`));

  await Promise.all([spyChannel, legitChannel].map((ch) => new Promise<void>((resolve, reject) => {
    ch.subscribe((status, err) => { if (status === "SUBSCRIBED") resolve(); if (status === "CHANNEL_ERROR") reject(err); });
  })));
  await new Promise((r) => setTimeout(r, 1500)); // let the postgres_changes listener attach

  try {
    await customer.client.from("messages").insert({ order_id: orderId, body: "realtime ping" });
    // Poll instead of a fixed sleep: the local Realtime server is slow when the
    // whole suite subscribes at once. Then a short grace period for the spy.
    const deadline = Date.now() + 15000;
    while (!received.includes("legit:realtime ping") && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
    }
    await new Promise((r) => setTimeout(r, 1000));
    // The participant gets the event (Realtime may also replay inserts from just
    // before the subscription attached); the non-participant gets nothing at all.
    assert.ok(received.includes("legit:realtime ping"), `participant did not receive the ping: ${JSON.stringify(received)}`);
    assert.deepEqual(received.filter((r) => r.startsWith("spy:")), [], `non-participant received events: ${JSON.stringify(received)}`);
  } finally {
    for (const u of [tailorA, tailorB]) {
      await u.client.removeAllChannels();
      u.client.realtime.disconnect(); // otherwise the open socket keeps the test process alive
    }
  }
});

test("ORDER PIPELINE: only the tailor advances, strictly linearly, with double-click protection", async () => {
  const c = await customer.client.rpc("advance_order", { p_order_id: orderId, p_expected_status: "accepted" });
  expectCode(c.error, "42501", "customer advances");
  const a = await tailorA.client.rpc("advance_order", { p_order_id: orderId, p_expected_status: "accepted" });
  expectCode(a.error, "42501", "other tailor advances");

  const s1 = await tailorB.client.rpc("advance_order", { p_order_id: orderId, p_expected_status: "accepted" });
  assert.equal(s1.error, null);
  assert.equal(s1.data, "in_progress");

  const stale = await tailorB.client.rpc("advance_order", { p_order_id: orderId, p_expected_status: "accepted" });
  expectCode(stale.error, "P0001", "stale expected status");

  const s2 = await tailorB.client.rpc("advance_order", { p_order_id: orderId, p_expected_status: "in_progress" });
  assert.equal(s2.data, "ready");
  const s3 = await tailorB.client.rpc("advance_order", { p_order_id: orderId, p_expected_status: "ready" });
  assert.equal(s3.data, "completed");
  const done = await tailorB.client.rpc("advance_order", { p_order_id: orderId, p_expected_status: "completed" });
  expectCode(done.error, "P0001", "advance past completed");

  const order = await customer.client.from("orders").select("status, completed_at").eq("id", orderId).single();
  assert.equal(order.data?.status, "completed");
  assert.ok(order.data?.completed_at);
});

test("orders cannot be edited directly by anyone", async () => {
  const { error } = await tailorB.client.from("orders").update({ status: "accepted" }).eq("id", orderId);
  expectCode(error, "42501", "direct order update");
});
