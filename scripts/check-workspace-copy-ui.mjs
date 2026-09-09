import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defaultPreset, defaultTaxPresets } from "../client/src/constants.ts";

// Intercept every application API request; no real account or customer is accessed.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
  headless: true,
});
const origin = process.env.UI_TEST_ORIGIN || "http://localhost:5173";
const screenshots = new URL("../output/workspace-copy/", import.meta.url);
await mkdir(screenshots, { recursive: true });
const failures = [];
const forbiddenCopy = /mongodb|database ready|checking database|secure session|data stored|in-browser|encrypted customer|protected tenant|protected customer|signed in securely|system notes/i;
const pagination = { page: 1, totalPages: 1, totalItems: 0, pageSize: 5 };
const customer = {
  _id: "test-customer",
  name: "Example Guest",
  phone: "+919000000000",
  email: "guest@example.com",
  address: "",
  state: "",
  notes: "",
  whatsappOptIn: false,
  status: "active",
  version: 1,
  bookingCount: 0,
};

async function checkCopy(page) {
  assert.doesNotMatch(await page.locator("body").innerText(), forbiddenCopy);
  assert.equal(
    await page.locator(".db-badge, .db-status, .security-badge, .sidebar-foot").count(),
    0,
    "Technical badges and the storage footer must not be rendered",
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
    "Page must stay within the viewport",
  );
}

try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    let authenticated = false;
    let unavailable = false;
    let logouts = 0;
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on("pageerror", (error) => failures.push(error.message));
    const auth = () => ({
      authenticated,
      authRequired: true,
      user: authenticated ? { displayName: "Test Owner", role: "owner" } : null,
      organization: authenticated ? { name: "Example Hotel", role: "owner" } : null,
      csrfToken: authenticated ? "test-csrf" : null,
      sessionExpiresAt: authenticated ? new Date(Date.now() + 3_600_000).toISOString() : null,
    });
    await context.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let status = 200;
      let data;
      if (path.endsWith("/auth/me")) {
        status = unavailable ? 503 : 200;
        data = unavailable ? { message: "Workspace unavailable. Please try again." } : auth();
      } else if (path.endsWith("/auth/login")) {
        authenticated = true;
        data = auth();
      } else if (path.endsWith("/auth/logout")) {
        assert.equal(route.request().headers()["x-csrf-token"], "test-csrf");
        authenticated = false;
        logouts++;
        data = {};
      } else if (path.endsWith("/settings")) {
        data = {
          preset: { ...defaultPreset, business_name: "Example Hotel" },
          taxPresets: defaultTaxPresets,
          logoDataUrl: null,
        };
      } else if (path.endsWith("/next-number")) {
        data = { invNo: "TEST-1" };
      } else if (path.endsWith("/customers/test-customer")) {
        data = customer;
      } else if (path.endsWith("/customers/search")) {
        data = {
          items: [{ ...customer, phoneMasked: "+91 ******0000" }],
          pagination: { ...pagination, totalItems: 1 },
        };
      } else if (path.includes("/reference-data/")) {
        data = [];
      } else {
        data = {
          rows: [], items: [], pagination,
          counts: { all: 0, draft: 0, reserved: 0, checkedIn: 0, checkedOut: 0, cancelled: 0 },
          summary: { total: 0, open: 0, confirmed: 0 },
        };
      }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    });

    await page.goto(origin);
    await page.getByRole("heading", { name: "Welcome back" }).waitFor();
    await page.getByLabel("Email address").fill("owner@example.com");
    await page.getByLabel("Password", { exact: true }).fill("test-password-only");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByText("All Invoices", { exact: true }).waitFor();
    await checkCopy(page);
    await page.screenshot({ path: fileURLToPath(new URL(`invoices-${viewport.width}.png`, screenshots)), fullPage: true });

    await page.getByRole("button", { name: "About & Help", exact: true }).click();
    await page.getByText("Invoice format", { exact: true }).waitFor();
    await checkCopy(page);
    await page.screenshot({ path: fileURLToPath(new URL(`about-${viewport.width}.png`, screenshots)), fullPage: true });

    await page.getByRole("button", { name: "Customers", exact: true }).click();
    await page.locator(".customer-directory-row").filter({ hasText: "Example Guest" }).click();
    await page.getByRole("heading", { name: "Bookings & advances", exact: true }).waitFor();
    await checkCopy(page);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByRole("heading", { name: "Welcome back" }).waitFor();
    assert.equal(logouts, 1, "Sign out must still work");
    await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
    await page.getByRole("heading", { name: "Find your account" }).waitFor();
    await checkCopy(page);

    unavailable = true;
    await page.reload();
    await page.getByRole("heading", { name: "Workspace unavailable", exact: true }).waitFor();
    await checkCopy(page);
    unavailable = false;
    await page.getByRole("button", { name: "Retry connection", exact: true }).click();
    await page.getByRole("heading", { name: "Welcome back" }).waitFor();
    await context.close();
  }
  assert.deepEqual(failures, []);
  console.log("Workspace copy passed on desktop/mobile: login, navigation, About, customer details, sign out, recovery and connection retry. No live data used.");
} finally {
  await browser.close();
}
