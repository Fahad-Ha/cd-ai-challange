import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createUser, cleanupUsers, expectCode, type TestUser } from "./helpers.ts";

let customer: TestUser;
let otherCustomer: TestUser;
let tailor: TestUser;
let completedOrder: string;
let openOrder: string;

async function orderFor(c: TestUser, t: TestUser, title: string) {
  const req = await c.client.from("requests").insert({ title, description: "d" }).select("id").single();
  const bid = await t.client.from("bids").insert({ request_id: req.data!.id, price: 80, turnaround_days: 4, note: "" }).select("id").single();
  const o = await c.client.rpc("accept_bid", { p_bid_id: bid.data!.id, p_expected_price: 80, p_expected_turnaround: 4 });
  if (o.error) throw new Error(o.error.message);
  return o.data as string;
}

before(async () => {
  customer = await createUser("customer");
  otherCustomer = await createUser("customer");
  tailor = await createUser("tailor", "Reviewed Tailor");
  completedOrder = await orderFor(customer, tailor, "Completed job");
  for (const s of ["accepted", "in_progress", "ready"]) {
    const r = await tailor.client.rpc("advance_order", { p_order_id: completedOrder, p_expected_status: s });
    if (r.error) throw new Error(r.error.message);
  }
  openOrder = await orderFor(customer, tailor, "Still running");
});
after(cleanupUsers);

test("TAMPER 4a: a customer cannot review an order that is not completed", async () => {
  const { error } = await customer.client.from("reviews").insert({ order_id: openOrder, tailor_id: tailor.id, rating: 5, comment: "early" });
  expectCode(error, "42501", "review before completion");
});

test("TAMPER 4b: nobody but the order's customer can review it", async () => {
  const t = await tailor.client.from("reviews").insert({ order_id: completedOrder, tailor_id: tailor.id, rating: 5, comment: "me" });
  expectCode(t.error, "42501", "tailor reviews self");
  const o = await otherCustomer.client.from("reviews").insert({ order_id: completedOrder, tailor_id: tailor.id, rating: 1, comment: "stranger" });
  expectCode(o.error, "42501", "stranger reviews");
});

test("the review's tailor_id cannot be forged to another tailor", async () => {
  const another = await createUser("tailor", "Innocent Tailor");
  const { error } = await customer.client.from("reviews").insert({ order_id: completedOrder, tailor_id: another.id, rating: 1, comment: "forged" });
  expectCode(error, "42501", "forged tailor_id");
});

test("the customer can review a completed order exactly once", async () => {
  const ok = await customer.client.from("reviews").insert({ order_id: completedOrder, tailor_id: tailor.id, rating: 4, comment: "Great fit" }).select("id, customer_id").single();
  assert.equal(ok.error, null);
  assert.equal(ok.data?.customer_id, customer.id);

  const dup = await customer.client.from("reviews").insert({ order_id: completedOrder, tailor_id: tailor.id, rating: 5, comment: "again" });
  expectCode(dup.error, "23505", "duplicate review");
});

test("rating must be 1..5 (the CHECK constraint, not the policy, is what refuses it)", async () => {
  const bad = await customer.client.from("reviews").insert({ order_id: completedOrder, tailor_id: tailor.id, rating: 9, comment: "" });
  expectCode(bad.error, "23514", "rating out of range");
});

test("reviews are public to signed-in users and tailor_stats derives rating, count, completed orders", async () => {
  const seen = await otherCustomer.client.from("reviews").select("rating").eq("tailor_id", tailor.id);
  assert.deepEqual(seen.data, [{ rating: 4 }]);

  const stats = await otherCustomer.client.rpc("tailor_stats", { p_tailor_id: tailor.id }).single();
  assert.equal(stats.error, null);
  assert.equal(Number(stats.data?.avg_rating), 4);
  assert.equal(stats.data?.review_count, 1);
  assert.equal(stats.data?.completed_orders, 1);
});
