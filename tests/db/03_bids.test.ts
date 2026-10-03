import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createUser, cleanupUsers, anonClient, expectCode, type TestUser } from "./helpers.ts";

let customer: TestUser;
let otherCustomer: TestUser;
let tailorA: TestUser;
let tailorB: TestUser;
let tailorC: TestUser;
let requestId: string;
let bidA: string;
let bidB: string;

before(async () => {
  customer = await createUser("customer");
  otherCustomer = await createUser("customer");
  tailorA = await createUser("tailor", "Tailor A");
  tailorB = await createUser("tailor", "Tailor B");
  tailorC = await createUser("tailor", "Tailor C");
  const { data } = await customer.client.from("requests").insert({ title: "Linen shirt", description: "Summer weight" }).select("id").single();
  requestId = data!.id;
});
after(cleanupUsers);

test("a tailor can bid on an open request; the bid starts pending and revision 1 is logged", async () => {
  const { data, error } = await tailorA.client
    .from("bids")
    .insert({ request_id: requestId, price: 120, turnaround_days: 7, note: "Italian linen" })
    .select("id, status, tailor_id")
    .single();
  assert.equal(error, null);
  assert.equal(data?.status, "pending");
  assert.equal(data?.tailor_id, tailorA.id);
  bidA = data!.id;

  const revs = await tailorA.client.from("bid_revisions").select("revision_no, price").eq("bid_id", bidA);
  assert.deepEqual(revs.data, [{ revision_no: 1, price: 120 }]);
});

test("a customer cannot bid", async () => {
  const { error } = await customer.client.from("bids").insert({ request_id: requestId, price: 1, turnaround_days: 1, note: "" });
  expectCode(error, "42501", "customer bid");
});

test("a tailor cannot bid twice on the same request (one bid, revised in place)", async () => {
  const { error } = await tailorA.client.from("bids").insert({ request_id: requestId, price: 100, turnaround_days: 5, note: "" });
  expectCode(error, "23505", "duplicate bid");
});

test("a tailor cannot submit a bid as someone else or pre-set its status", async () => {
  const forged = await tailorB.client.from("bids").insert({ request_id: requestId, price: 1, turnaround_days: 1, note: "", tailor_id: tailorA.id });
  expectCode(forged.error, "42501", "forged tailor_id");
  const preset = await tailorB.client.from("bids").insert({ request_id: requestId, price: 1, turnaround_days: 1, note: "", status: "accepted" });
  expectCode(preset.error, "42501", "preset status");
});

test("BLIND BIDDING: a tailor sees only their own bid on a request, never a competitor's", async () => {
  const b = await tailorB.client.from("bids").insert({ request_id: requestId, price: 150, turnaround_days: 5, note: "Premium" }).select("id").single();
  bidB = b.data!.id;

  const aView = await tailorA.client.from("bids").select("id, price").eq("request_id", requestId);
  assert.deepEqual(aView.data, [{ id: bidA, price: 120 }]);

  const direct = await tailorA.client.from("bids").select("*").eq("id", bidB);
  assert.equal(direct.error, null);
  assert.deepEqual(direct.data, []); // not an error — the row simply does not exist for A

  const revs = await tailorA.client.from("bid_revisions").select("id").eq("bid_id", bidB);
  assert.deepEqual(revs.data, []);
});

test("the request's customer sees every bid; another customer sees none", async () => {
  const owner = await customer.client.from("bids").select("id").eq("request_id", requestId);
  assert.equal(owner.data?.length, 2);
  const other = await otherCustomer.client.from("bids").select("id").eq("request_id", requestId);
  assert.deepEqual(other.data, []);
});

test("a tailor can revise their bid while the request is open; every revision is logged", async () => {
  const { data, error } = await tailorA.client
    .from("bids")
    .update({ price: 110, note: "Discounted", status: "pending" })
    .eq("id", bidA)
    .select("price")
    .single();
  assert.equal(error, null);
  assert.equal(data?.price, 110);

  const revs = await tailorA.client.from("bid_revisions").select("revision_no, price").eq("bid_id", bidA).order("revision_no");
  assert.deepEqual(revs.data, [
    { revision_no: 1, price: 120 },
    { revision_no: 2, price: 110 },
  ]);
});

test("a tailor cannot move their own bid to accepted or closed", async () => {
  const accepted = await tailorA.client.from("bids").update({ status: "accepted" }).eq("id", bidA);
  expectCode(accepted.error, "42501", "self-accept via update");
  const closed = await tailorA.client.from("bids").update({ status: "closed" }).eq("id", bidA);
  expectCode(closed.error, "42501", "self-close via update");
});

test("a tailor cannot re-point their bid at another request or tailor", async () => {
  const { error } = await tailorA.client.from("bids").update({ tailor_id: tailorB.id }).eq("id", bidA);
  expectCode(error, "42501", "update tailor_id");
});

test("a tailor cannot edit a competitor's bid (row invisible → zero rows updated)", async () => {
  const { data, error } = await tailorA.client.from("bids").update({ price: 1, status: "pending" }).eq("id", bidB).select("id");
  assert.equal(error, null);
  assert.deepEqual(data, []);
  const check = await tailorB.client.from("bids").select("price").eq("id", bidB).single();
  assert.equal(check.data?.price, 150);
});

test("BLIND BIDDING aggregate: count always; averages only once 3 bids exist; never min/max", async () => {
  const two = await tailorA.client.rpc("request_bid_stats", { p_request_id: requestId }).single();
  assert.equal(two.error, null);
  assert.deepEqual(two.data, { bid_count: 2, avg_price: null, avg_turnaround: null });

  await tailorC.client.from("bids").insert({ request_id: requestId, price: 130, turnaround_days: 6, note: "" });
  const three = await tailorA.client.rpc("request_bid_stats", { p_request_id: requestId }).single();
  assert.equal(three.data?.bid_count, 3);
  assert.equal(Number(three.data?.avg_price), 130); // (110 + 150 + 130) / 3
  assert.equal(Number(three.data?.avg_turnaround), 6);
  assert.ok(!("min_price" in (three.data ?? {})));
});

test("the aggregate is only for tailors and the request owner", async () => {
  const owner = await customer.client.rpc("request_bid_stats", { p_request_id: requestId }).single();
  assert.equal(owner.error, null);
  const other = await otherCustomer.client.rpc("request_bid_stats", { p_request_id: requestId }).single();
  expectCode(other.error, "42501", "other customer stats");
  const anon = await anonClient().rpc("request_bid_stats", { p_request_id: requestId });
  assert.ok(anon.error, "anon should be denied");
});
