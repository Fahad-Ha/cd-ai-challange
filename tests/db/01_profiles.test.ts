import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createUser, cleanupUsers, anonClient, expectCode, type TestUser } from "./helpers.ts";

let customer: TestUser;
let tailor: TestUser;

before(async () => {
  customer = await createUser("customer", "Cara Customer");
  tailor = await createUser("tailor", "Tariq Tailor");
});
after(cleanupUsers);

test("signup trigger creates a profile with the role chosen at signup", async () => {
  const { data, error } = await customer.client.from("profiles").select("id, role, display_name").eq("id", customer.id).single();
  assert.equal(error, null);
  assert.deepEqual(data, { id: customer.id, role: "customer", display_name: "Cara Customer" });

  const t = await tailor.client.from("profiles").select("role").eq("id", tailor.id).single();
  assert.equal(t.data?.role, "tailor");
});

test("an invalid role in signup metadata falls back to customer", async () => {
  const weird = await createUser("admin", "Wannabe Admin");
  const { data } = await weird.client.from("profiles").select("role").eq("id", weird.id).single();
  assert.equal(data?.role, "customer");
});

test("a user cannot change their own role (column is not updatable)", async () => {
  const { error } = await customer.client.from("profiles").update({ role: "tailor" }).eq("id", customer.id);
  expectCode(error, "42501", "update role");
  const { data } = await customer.client.from("profiles").select("role").eq("id", customer.id).single();
  assert.equal(data?.role, "customer");
});

test("changing user_metadata.role after signup does not change the profile role", async () => {
  const { error } = await customer.client.auth.updateUser({ data: { role: "tailor" } });
  assert.equal(error, null);
  const { data } = await customer.client.from("profiles").select("role").eq("id", customer.id).single();
  assert.equal(data?.role, "customer");
});

test("a user can update their own display_name but not someone else's", async () => {
  const own = await customer.client.from("profiles").update({ display_name: "Cara C." }).eq("id", customer.id).select("display_name").single();
  assert.equal(own.error, null);
  assert.equal(own.data?.display_name, "Cara C.");

  const other = await customer.client.from("profiles").update({ display_name: "Hacked" }).eq("id", tailor.id).select("id");
  assert.equal(other.error, null); // RLS hides the row: 0 rows updated, no error
  assert.deepEqual(other.data, []);
  const check = await tailor.client.from("profiles").select("display_name").eq("id", tailor.id).single();
  assert.equal(check.data?.display_name, "Tariq Tailor");
});

test("authenticated users can read other profiles (names), anon cannot read anything", async () => {
  const { data } = await customer.client.from("profiles").select("display_name").eq("id", tailor.id).single();
  assert.equal(data?.display_name, "Tariq Tailor");

  const anon = await anonClient().from("profiles").select("id");
  assert.ok(anon.error, "anon should be denied");
});
