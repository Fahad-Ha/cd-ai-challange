import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createUser, cleanupUsers, anonClient, expectCode, type TestUser } from "./helpers.ts";

let customer: TestUser;
let otherCustomer: TestUser;
let tailor: TestUser;
let requestId: string;

before(async () => {
  customer = await createUser("customer");
  otherCustomer = await createUser("customer");
  tailor = await createUser("tailor");
});
after(cleanupUsers);

test("a customer can post a request; it starts open and belongs to them", async () => {
  const { data, error } = await customer.client
    .from("requests")
    .insert({ title: "Navy wool suit", description: "Two-piece, slim fit" })
    .select("id, status, customer_id, closed_at")
    .single();
  assert.equal(error, null);
  assert.equal(data?.status, "open");
  assert.equal(data?.customer_id, customer.id);
  assert.equal(data?.closed_at, null);
  requestId = data!.id;
});

test("a tailor cannot post a request", async () => {
  const { error } = await tailor.client.from("requests").insert({ title: "x", description: "y" });
  expectCode(error, "42501", "tailor insert request");
});

test("a customer cannot post a request on someone else's behalf (customer_id is not insertable)", async () => {
  const { error } = await customer.client
    .from("requests")
    .insert({ title: "x", description: "y", customer_id: otherCustomer.id });
  expectCode(error, "42501", "insert with explicit customer_id");
});

test("a customer cannot pre-close a request or set closed_at on insert", async () => {
  const { error } = await customer.client
    .from("requests")
    .insert({ title: "x", description: "y", status: "closed" });
  expectCode(error, "42501", "insert with status");
});

test("customers see only their own requests; tailors see every request", async () => {
  const mine = await customer.client.from("requests").select("id").eq("id", requestId);
  assert.equal(mine.data?.length, 1);

  const theirs = await otherCustomer.client.from("requests").select("id").eq("id", requestId);
  assert.equal(theirs.error, null);
  assert.deepEqual(theirs.data, []);

  const tailorView = await tailor.client.from("requests").select("id").eq("id", requestId);
  assert.equal(tailorView.data?.length, 1);
});

test("nobody can close a request by updating it directly (closing only happens through accept_bid)", async () => {
  const { error } = await customer.client.from("requests").update({ status: "closed" }).eq("id", requestId);
  expectCode(error, "42501", "direct status update");
  const t = await tailor.client.from("requests").update({ title: "pwned" }).eq("id", requestId);
  expectCode(t.error, "42501", "tailor update");
});

test("a request may only reference a photo inside the customer's own storage folder", async () => {
  const ok = await customer.client
    .from("requests")
    .insert({ title: "With photo", description: "see photo", photo_path: `${customer.id}/ref.jpg` })
    .select("id")
    .single();
  assert.equal(ok.error, null);

  const stolen = await customer.client
    .from("requests")
    .insert({ title: "With photo", description: "see photo", photo_path: `${otherCustomer.id}/ref.jpg` });
  expectCode(stolen.error, "42501", "foreign photo_path");
});

test("anon cannot read requests", async () => {
  const { error } = await anonClient().from("requests").select("id");
  assert.ok(error, "anon should be denied");
});
