import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createUser, cleanupUsers, type TestUser } from "./helpers.ts";

const BUCKET = "reference-photos";
let customer: TestUser;
let otherCustomer: TestUser;
let tailor: TestUser;
const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" });

before(async () => {
  customer = await createUser("customer");
  otherCustomer = await createUser("customer");
  tailor = await createUser("tailor");
});
after(async () => {
  await cleanupUsers();
});

test("a customer can upload into their own folder only", async () => {
  const own = await customer.client.storage.from(BUCKET).upload(`${customer.id}/ref.png`, png, { contentType: "image/png" });
  assert.equal(own.error, null);
  const foreign = await customer.client.storage.from(BUCKET).upload(`${otherCustomer.id}/ref.png`, png, { contentType: "image/png" });
  assert.ok(foreign.error, "upload to another user's folder must fail");
});

test("the owner and any tailor can read the photo; another customer cannot", async () => {
  const path = `${customer.id}/ref.png`;
  const own = await customer.client.storage.from(BUCKET).download(path);
  assert.equal(own.error, null);
  const t = await tailor.client.storage.from(BUCKET).download(path);
  assert.equal(t.error, null);
  const other = await otherCustomer.client.storage.from(BUCKET).download(path);
  assert.ok(other.error, "another customer must not read it");
  const signed = await otherCustomer.client.storage.from(BUCKET).createSignedUrl(path, 60);
  assert.ok(signed.error, "another customer must not sign a url for it");
});

test("only images are accepted and the bucket is private", async () => {
  const txt = new Blob(["hello"], { type: "text/plain" });
  const bad = await customer.client.storage.from(BUCKET).upload(`${customer.id}/notes.txt`, txt, { contentType: "text/plain" });
  assert.ok(bad.error, "non-image must be rejected");
  const pub = customer.client.storage.from(BUCKET).getPublicUrl(`${customer.id}/ref.png`);
  const res = await fetch(pub.data.publicUrl);
  assert.notEqual(res.status, 200);
});
