import { test, expect } from "@playwright/test";
import { signUp, logIn } from "./helpers";

// 1x1 transparent PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test("a customer posts a request and sees it open on its own page and in their list", async ({ page }) => {
  await signUp(page, "customer", "Poster");
  await page.getByRole("link", { name: /new request/i }).first().click();
  await expect(page).toHaveURL(/\/customer\/requests\/new/);
  await page.getByLabel("Title").fill("Charcoal flannel trousers");
  await page.getByLabel("Description").fill("High-rise, single pleat, side adjusters, 9-inch leg opening.");
  await page.getByRole("button", { name: /post request/i }).click();

  await expect(page).toHaveURL(/\/customer\/requests\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Charcoal flannel trousers");
  await expect(page.getByText(/^open$/i).first()).toBeVisible();
  await expect(page.getByText(/no bids yet/i)).toBeVisible();

  await page.goto("/customer/requests");
  await expect(page.getByRole("link", { name: /charcoal flannel trousers/i })).toBeVisible();
});

test("a reference photo can be uploaded and turned into a suggested description", async ({ page }) => {
  await signUp(page, "customer", "Photo Poster");
  await page.goto("/customer/requests/new");
  await page.getByLabel(/reference photo/i).setInputFiles({ name: "ref.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText(/photo uploaded/i)).toBeVisible();

  await page.getByRole("button", { name: /describe with ai/i }).click();
  const description = page.getByLabel("Description");
  await expect(description).not.toHaveValue("", { timeout: 20_000 });
  await description.fill((await description.inputValue()) + " Plus my own edit.");

  await page.getByLabel("Title").fill("From a photo");
  await page.getByRole("button", { name: /post request/i }).click();
  await expect(page).toHaveURL(/\/customer\/requests\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("img", { name: /reference photo/i })).toBeVisible();
  await expect(page.getByText(/plus my own edit/i)).toBeVisible();
});

test("the describe route refuses anonymous callers and photos outside the caller's folder", async ({ page, request }) => {
  const anon = await request.post("/api/describe-photo", { data: { path: "someone/else.png" } });
  expect(anon.status()).toBe(401);

  await signUp(page, "customer", "Api Poker");
  const foreign = await page.request.post("/api/describe-photo", { data: { path: "00000000-0000-0000-0000-000000000000/x.png" } });
  expect(foreign.status()).toBe(403);
});

test("tailors see the request in open requests; another customer gets a 404 on its page", async ({ browser, page }) => {
  await signUp(page, "customer", "Owner");
  await page.goto("/customer/requests/new");
  await page.getByLabel("Title").fill("Visible to tailors");
  await page.getByLabel("Description").fill("A plain navy blazer.");
  await page.getByRole("button", { name: /post request/i }).click();
  await expect(page).toHaveURL(/\/customer\/requests\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;

  const tailorCtx = await browser.newContext();
  const tailorPage = await tailorCtx.newPage();
  await signUp(tailorPage, "tailor", "Looker");
  await expect(tailorPage.getByRole("link", { name: /visible to tailors/i })).toBeVisible();
  await tailorPage.getByRole("link", { name: /visible to tailors/i }).click();
  await expect(tailorPage).toHaveURL(new RegExp(`/tailor/requests/${id}$`));
  await expect(tailorPage.getByRole("heading", { level: 1 })).toContainText("Visible to tailors");
  await tailorCtx.close();

  const otherCtx = await browser.newContext();
  const otherPage = await otherCtx.newPage();
  await signUp(otherPage, "customer", "Nosy");
  const res = await otherPage.goto(`/customer/requests/${id}`);
  expect(res?.status()).toBe(404);
  await otherCtx.close();
});
