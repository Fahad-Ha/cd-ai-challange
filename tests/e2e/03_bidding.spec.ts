import { test, expect, type Browser, type Page } from "@playwright/test";
import { signUp, createRequestViaUi, fillBid } from "./helpers";

async function tailorPage(browser: Browser, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signUp(page, "tailor", name);
  return page;
}

test.describe.serial("bidding on one request", () => {
  let customer: Page;
  let tailorA: Page;
  let tailorB: Page;
  let tailorC: Page;
  let requestId: string;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    customer = await ctx.newPage();
    await signUp(customer, "customer", "Bid Customer");
    requestId = await createRequestViaUi(customer, "Three-piece tweed suit");
    tailorA = await tailorPage(browser, "Tailor Alpha");
    tailorB = await tailorPage(browser, "Tailor Beta");
    tailorC = await tailorPage(browser, "Tailor Gamma");
  });

  test("a tailor places a bid; it is pending and counts as revision 1", async () => {
    await tailorA.goto(`/tailor/requests/${requestId}`);
    await fillBid(tailorA, 300, 14, "Harris tweed, two fittings.");
    await expect(tailorA.getByText(/^pending$/i)).toBeVisible();
    await expect(tailorA.getByText(/revision 1\b/i)).toBeVisible();
    await expect(tailorA.getByText(/1 bid\b/)).toBeVisible();
    await expect(tailorA.getByText(/averages unlock at 3 bids/i)).toBeVisible();
  });

  test("the tailor revises; every revision is counted", async () => {
    await fillBid(tailorA, 280, 14, "Harris tweed, two fittings. Sharpened the price.");
    await expect(tailorA.getByText(/revision 2\b/i)).toBeVisible();
    await expect(tailorA.getByRole("spinbutton", { name: /price/i })).toHaveValue("280");
  });

  test("BLIND: a second tailor sees the count but never the first tailor's numbers", async () => {
    await tailorB.goto(`/tailor/requests/${requestId}`);
    await expect(tailorB.getByText(/1 bid\b/)).toBeVisible();
    await expect(tailorB.getByRole("button", { name: /place bid/i })).toBeVisible();
    const body = await tailorB.locator("main").innerText();
    expect(body).not.toMatch(/\b280\b|\b300\b|Harris tweed|Tailor Alpha/);
  });

  test("once three bids exist, every tailor sees averages only", async () => {
    await fillBid(tailorB, 350, 10, "Donegal tweed.");
    await tailorC.goto(`/tailor/requests/${requestId}`);
    await fillBid(tailorC, 400, 21, "Shetland tweed, hand-finished.");
    await tailorA.reload();
    await expect(tailorA.getByText(/3 bids\b/)).toBeVisible();
    await expect(tailorA.getByText(/average price/i)).toBeVisible();
    await expect(tailorA.getByText(/343/)).toBeVisible(); // (280 + 350 + 400) / 3 = 343.33
    const body = await tailorA.locator("main").innerText();
    expect(body).not.toMatch(/\b350\b|\b400\b|Donegal|Shetland|Tailor Beta|Tailor Gamma/);
  });

  test("the customer sees every bid with its revision count and can decline one", async () => {
    await customer.goto(`/customer/requests/${requestId}`);
    const bids = customer.locator("[data-bid]");
    await expect(bids).toHaveCount(3);
    const alpha = bids.filter({ hasText: "Tailor Alpha" });
    await expect(alpha).toContainText("280");
    await expect(alpha).toContainText(/2 revisions/i);
    await alpha.getByRole("button", { name: /decline/i }).click();
    await expect(alpha.getByText(/^declined$/i)).toBeVisible();
  });

  test("a declined tailor revises and is pending again", async () => {
    await tailorA.reload();
    await expect(tailorA.getByText(/^declined$/i)).toBeVisible();
    await fillBid(tailorA, 260, 12, "Harris tweed. Final offer.");
    await expect(tailorA.getByText(/^pending$/i)).toBeVisible();
    await expect(tailorA.getByText(/revision 3\b/i)).toBeVisible();
  });

  test("accepting a bid creates the order, closes the request, and freezes the other bids", async () => {
    await customer.goto(`/customer/requests/${requestId}`);
    const beta = customer.locator("[data-bid]").filter({ hasText: "Tailor Beta" });
    await beta.getByRole("button", { name: /accept/i }).click();
    await expect(customer).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);

    await customer.goto(`/customer/requests/${requestId}`);
    await expect(customer.getByText(/^closed$/i).first()).toBeVisible();

    await tailorA.reload();
    await expect(tailorA.getByText(/^closed$/i).first()).toBeVisible();
    await expect(tailorA.getByRole("button", { name: /update bid/i })).toHaveCount(0);
    await expect(tailorA.getByText(/request has closed/i)).toBeVisible();

    await tailorB.reload();
    await expect(tailorB.getByText(/^accepted$/i).first()).toBeVisible();
    await expect(tailorB.getByRole("link", { name: /open the order/i })).toBeVisible();
  });
});
