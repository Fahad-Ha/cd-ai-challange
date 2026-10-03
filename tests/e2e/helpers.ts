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
