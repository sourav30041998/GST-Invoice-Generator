import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defaultPreset, defaultTaxPresets } from "../client/src/constants.ts";

// All application API calls are intercepted; this test never uses real accounts or sends mail.
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
  headless: true,
});
const origin = process.env.UI_TEST_ORIGIN || "http://localhost:5173";
const screenshots = new URL("../output/organization-email/", import.meta.url);
await mkdir(screenshots, { recursive: true });
const base = {
  gmailAvailable: true,
  provider: null,
  status: "notConnected",
  senderName: "",
  senderEmail: "",
  dnsRecords: [],
  verifiedAt: null,
  lastAcceptedAt: null,
};
const failures = [];

try {
  for (const size of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    let connection = structuredClone(base);
    let writes = 0;
    let oauthCompletions = 0;
    const context = await browser.newContext({ viewport: size });
    const page = await context.newPage();
    page.on("pageerror", (error) => failures.push(error.message));
    await context.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data = {};
      let status = 200;
      if (path.endsWith("/auth/me"))
        data = {
          authenticated: true,
          authRequired: true,
          user: { displayName: "Test Owner", role: "owner" },
          organization: { name: "Example Hotel", role: "owner" },
          csrfToken: "test-csrf",
          sessionExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        };
      else if (path.endsWith("/settings"))
        data = {
          preset: { ...defaultPreset, business_name: "Example Hotel" },
          taxPresets: defaultTaxPresets,
          logoDataUrl: null,
        };
      else if (path.endsWith("/next-number")) data = { invNo: "TEST-1" };
      else if (path.includes("/organization-email")) {
        if (path.endsWith("/gmail/complete")) {
          oauthCompletions++;
          assert.equal(route.request().headers()["x-csrf-token"], "test-csrf");
          data = {
            ...base,
            provider: "gmail",
            status: "connected",
            senderName: "Example Hotel",
            senderEmail: "hotel@gmail.com",
          };
        } else if (route.request().method() !== "GET") {
          writes++;
          assert.equal(route.request().headers()["x-csrf-token"], "test-csrf");
          status = 401;
          data = { message: "The company account password is incorrect." };
        } else data = connection;
      } else
        data = {
          rows: [],
          items: [],
          counts: {
            all: 0,
            draft: 0,
            reserved: 0,
            checkedIn: 0,
            checkedOut: 0,
            cancelled: 0,
          },
          pagination: { page: 1, totalPages: 1, totalItems: 0, pageSize: 20 },
        };
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    });
    await page.goto(origin);
    await page
      .getByRole("button", { name: "Company Profile", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Company Email", exact: true })
      .click();
    const section = page.locator("#company-email");
    await section.getByRole("button", { name: /Use your domain/ }).waitFor();
    await section.screenshot({
      path: fileURLToPath(new URL(`settings-${size.width}.png`, screenshots)),
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
      "Page must not overflow horizontally",
    );
    await section.getByRole("button", { name: /Use your domain/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.equal(
      await dialog.evaluate((element) => element.matches(":modal")),
      true,
      "Background must be inert",
    );
    const box = await dialog.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= size.width + 1);
    await dialog.getByLabel("Sender email").fill("bookings@example.com");
    await dialog
      .getByLabel("Brevo API key")
      .fill("test-key-not-a-real-secret-12345");
    await dialog
      .getByLabel("Your company account password")
      .fill("wrong-test-password");
    await dialog.getByRole("button", { name: "Save connection" }).click();
    await dialog.getByRole("alert").waitFor();
    assert.equal(
      await dialog.getByLabel("Your company account password").inputValue(),
      "",
    );
    assert.equal(await dialog.getByLabel("Brevo API key").inputValue(), "");
    await page.waitForTimeout(3500);
    assert.equal(
      await dialog.getByRole("alert").isVisible(),
      true,
      "Errors must not auto-dismiss",
    );
    await page.screenshot({
      path: fileURLToPath(new URL(`validation-${size.width}.png`, screenshots)),
    });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.locator("dialog[open]").count(), 0);
    connection = {
      ...base,
      provider: "brevo",
      status: "pending",
      senderName: "Example Hotel",
      senderEmail: "bookings@example.com",
      dnsRecords: [
        {
          type: "TXT",
          host: "mail._domainkey",
          value: "v=DKIM1; p=" + "test-public-record-".repeat(30),
          verified: false,
        },
      ],
    };
    await section
      .getByRole("button", { name: "Refresh email settings" })
      .click();
    await section.getByRole("heading", { name: "DNS Records" }).waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    assert.equal(
      await section
        .getByRole("button", { name: "Send test email" })
        .isDisabled(),
      true,
    );
    connection = { ...connection, status: "connected" };
    await section
      .getByRole("button", { name: "Refresh email settings" })
      .click();
    await page.waitForFunction(
      () =>
        !document.querySelector(
          '#company-email [aria-label="Refresh email settings"]',
        )?.disabled,
    );
    await section.getByRole("button", { name: "Send test email" }).click();
    await page.getByRole("dialog").waitFor();
    assert.equal(writes, 1, "Opening test confirmation must not send mail");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await page.goto(
      `${origin}/email-connect?code=test-authorization-code&state=${"s".repeat(43)}`,
    );
    await page
      .getByText("Gmail is connected. Customer emails will use this sender.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      oauthCompletions,
      1,
      "StrictMode must not exchange an authorization code twice",
    );
    assert.equal(new URL(page.url()).search, "");
    assert.equal(new URL(page.url()).pathname, "/");
    assert.equal(
      await page.evaluate(() =>
        `${JSON.stringify(localStorage)}${JSON.stringify(sessionStorage)}`.includes(
          "test-authorization-code",
        ),
      ),
      false,
    );
    await context.close();
  }
  assert.deepEqual(failures, []);
  console.log(
    "Email UI passed: desktop/mobile layout, inert dialogs, persistent errors, credential clearing, DNS wrapping and test-send confirmation. No real API data or email was used.",
  );
} finally {
  await browser.close();
}
