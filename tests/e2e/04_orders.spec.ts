import { test, expect, type Browser, type Page } from "@playwright/test";
import { signUp, createRequestViaUi, fillBid } from "./helpers";

async function newUser(browser: Browser, role: "customer" | "tailor", name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signUp(page, role, name);
  return page;
}

test.describe.serial("one order from acceptance to review", () => {
  let customer: Page;
  let winner: Page;
  let loser: Page;
  let stranger: Page;
  let orderId: string;

  test.beforeAll(async ({ browser }) => {
    customer = await newUser(browser, "customer", "Order Customer");
    const requestId = await createRequestViaUi(customer, "Camel overcoat");
    winner = await newUser(browser, "tailor", "Tailor Winner");
    loser = await newUser(browser, "tailor", "Tailor Loser");
    stranger = await newUser(browser, "customer", "Stranger");
    await winner.goto(`/tailor/requests/${requestId}`);
    await fillBid(winner, 500, 20, "Camel hair, double-breasted.");
    await loser.goto(`/tailor/requests/${requestId}`);
    await fillBid(loser, 450, 25, "Wool blend.");
    await customer.goto(`/customer/requests/${requestId}`);
    await customer.locator("[data-bid]").filter({ hasText: "Tailor Winner" }).getByRole("button", { name: /accept/i }).click();
    await expect(customer).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
    orderId = customer.url().split("/").pop()!;
  });

  test("only the tailor can advance the order, one step at a time", async () => {
    await expect(customer.getByRole("button", { name: /start work|mark ready|mark completed/i })).toHaveCount(0);
    await winner.goto(`/orders/${orderId}`);
    await expect(winner.getByRole("button", { name: /start work/i })).toBeVisible();
    await expect(winner.getByRole("button", { name: /mark ready|mark completed/i })).toHaveCount(0);
    await winner.getByRole("button", { name: /start work/i }).click();
    await expect(winner.getByText(/^in progress$/i).first()).toBeVisible();
    await expect(winner.getByRole("button", { name: /mark ready/i })).toBeVisible();
  });

  test("chat is live between the two participants", async () => {
    await customer.goto(`/orders/${orderId}`);
    await customer.getByRole("textbox", { name: /message/i }).fill("Hello, could the lining be burgundy?");
    await customer.getByRole("button", { name: /^send$/i }).click();
    await expect(customer.getByText("Hello, could the lining be burgundy?")).toBeVisible();

    // the tailor already has the page open: the message must arrive without a reload
    await expect(winner.getByText("Hello, could the lining be burgundy?")).toBeVisible({ timeout: 15_000 });
    await winner.getByRole("textbox", { name: /message/i }).fill("Burgundy it is.");
    await winner.getByRole("button", { name: /^send$/i }).click();
    await expect(customer.getByText("Burgundy it is.")).toBeVisible({ timeout: 15_000 });
  });

  test("a tailor who lost the bid and a stranger both get a 404 on the order", async () => {
    const r1 = await loser.goto(`/orders/${orderId}`);
    expect(r1?.status()).toBe(404);
    const r2 = await stranger.goto(`/orders/${orderId}`);
    expect(r2?.status()).toBe(404);
    await loser.goto("/orders");
    await expect(loser.getByText(/camel overcoat/i)).toHaveCount(0);
  });

  test("the customer can review only once the order is completed, and only once", async () => {
    await customer.goto(`/orders/${orderId}`);
    await expect(customer.getByRole("button", { name: /post review/i })).toHaveCount(0);
    await expect(customer.getByText(/once the order is completed/i)).toBeVisible();

    await winner.goto(`/orders/${orderId}`);
    await winner.getByRole("button", { name: /mark ready/i }).click();
    await expect(winner.getByRole("button", { name: /mark completed/i })).toBeVisible();
    await winner.getByRole("button", { name: /mark completed/i }).click();
    await expect(winner.getByText(/^completed$/i).first()).toBeVisible();
    await expect(winner.getByRole("button", { name: /start work|mark ready|mark completed/i })).toHaveCount(0);

    await customer.reload();
    await customer.getByRole("radio", { name: /5 stars/i }).check();
    await customer.getByRole("textbox", { name: /comment/i }).fill("Beautiful coat, perfect shoulders.");
    await customer.getByRole("button", { name: /post review/i }).click();
    await expect(customer.getByText("Beautiful coat, perfect shoulders.")).toBeVisible();
    await expect(customer.getByRole("button", { name: /post review/i })).toHaveCount(0);
  });

  test("the tailor's public profile shows the derived rating", async () => {
    await customer.getByRole("link", { name: "Tailor Winner" }).first().click();
    await expect(customer).toHaveURL(/\/tailors\/[0-9a-f-]{36}$/);
    await expect(customer.getByRole("heading", { level: 1 })).toContainText("Tailor Winner");
    await expect(customer.getByText(/5\.0/)).toBeVisible();
    await expect(customer.getByText(/1 review\b/)).toBeVisible();
    await expect(customer.getByText(/1 completed order/)).toBeVisible();
    await expect(customer.getByText("Beautiful coat, perfect shoulders.")).toBeVisible();
  });
});
