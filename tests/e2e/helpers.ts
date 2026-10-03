import { expect, type Page } from "@playwright/test";

export const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@e2e.local`;
export const PASSWORD = "e2e-password-1";

export async function signUp(page: Page, role: "customer" | "tailor", displayName: string) {
  const email = unique(role);
  await page.goto("/signup");
  await page.getByLabel("Name").fill(displayName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("radio", { name: role === "customer" ? /customer/i : /tailor/i }).check();
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(role === "customer" ? /\/customer\/requests/ : /\/tailor\/requests/);
  return { email, displayName };
}

export async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /log in/i }).click();
}

/** Customer-side: post a request through the UI and return its id. */
export async function createRequestViaUi(page: Page, title: string, description = "A plain description.") {
  await page.goto("/customer/requests/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Description").fill(description);
  await page.getByRole("button", { name: /post request/i }).click();
  await expect(page).toHaveURL(/\/customer\/requests\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

/** Tailor-side: place or update a bid on the tailor's request page (must already be there). */
export async function fillBid(page: Page, price: number, days: number, note: string) {
  await page.getByRole("spinbutton", { name: /price/i }).fill(String(price));
  await page.getByRole("spinbutton", { name: /turnaround/i }).fill(String(days));
  await page.getByRole("textbox", { name: /note/i }).fill(note);
  await page.getByRole("button", { name: /place bid|update bid/i }).click();
}
