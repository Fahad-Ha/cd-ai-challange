import { test, expect } from "@playwright/test";
import { signUp, logIn, PASSWORD } from "./helpers";

test("visiting a protected page while signed out redirects to login", async ({ page }) => {
  await page.goto("/customer/requests");
  await expect(page).toHaveURL(/\/login/);
});

test("a customer signs up, lands on their requests, and the shell shows their role", async ({ page }) => {
  const { displayName } = await signUp(page, "customer", "Cara E2E");
  await expect(page.getByRole("navigation")).toContainText(displayName);
  await expect(page.getByRole("navigation")).toContainText(/customer/i);
});

test("a tailor signs up and lands on open requests", async ({ page }) => {
  await signUp(page, "tailor", "Tariq E2E");
  await expect(page.getByRole("navigation")).toContainText(/tailor/i);
});

test("signup rejects an unknown role instead of silently creating a customer", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Sneaky");
  await page.getByLabel("Email").fill(`sneaky-${Date.now()}@e2e.local`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.evaluate(() => {
    const r = document.querySelector<HTMLInputElement>('input[type="radio"][name="role"]');
    if (r) { r.value = "admin"; r.checked = true; }
  });
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.locator("p[role=\"alert\"]")).toContainText(/role/i);
  await expect(page).toHaveURL(/\/signup/);
});

test("log in, land by role, sign out", async ({ page }) => {
  const { email } = await signUp(page, "customer", "Returning Customer");
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login/);

  await logIn(page, email);
  await expect(page).toHaveURL(/\/customer\/requests/);

  // the role gate: a customer visiting tailor pages is sent home
  await page.goto("/tailor/requests");
  await expect(page).toHaveURL(/\/customer\/requests/);
});

test("wrong password shows an error and stays on login", async ({ page }) => {
  await logIn(page, "nobody@e2e.local", "wrong-password");
  await expect(page.locator("p[role=\"alert\"]")).toContainText(/invalid|incorrect|wrong/i);
  await expect(page).toHaveURL(/\/login/);
});
