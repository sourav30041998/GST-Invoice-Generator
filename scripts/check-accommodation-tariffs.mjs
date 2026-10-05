import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defaultPreset, defaultTaxPresets } from "../client/src/constants.ts";
import { accommodationTotal } from "../client/src/utils/accommodationTariffs.ts";
import { createBookingSchema } from "../server/src/validation/bookingSchemas.ts";
import {
  buildBookingReceiptPdf,
  buildBookingSlipPdf,
} from "../server/src/services/bookingReceiptPdfService.ts";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const { getDocument } = await import(
  process.env.PDFJS_MODULE || "pdfjs-dist/legacy/build/pdf.mjs"
);
const standardFontDataUrl = fileURLToPath(
  new URL(
    "../../standard_fonts/",
    import.meta.resolve(
      process.env.PDFJS_MODULE || "pdfjs-dist/legacy/build/pdf.mjs",
    ),
  ),
).replaceAll("\\", "/");
const { createCanvas } = await import(
  process.env.CANVAS_MODULE || "@napi-rs/canvas"
);
const output = new URL("../output/accommodation-tariffs/", import.meta.url);
await mkdir(output, { recursive: true });
assert.equal(accommodationTotal([{ quantity: 3, tariffPerRoom: 0.1 }]), 0.3);
const customer = {
  _id: "64b7f19d71c6411b74000001",
  name: "Example Guest",
  phone: "+919000000000",
  email: "guest@example.test",
  address: "",
  state: "",
  notes: "",
  whatsappOptIn: false,
  status: "active",
  version: 0,
  bookingCount: 1,
};
let booking = {
  _id: "64b7f19d71c6411b74000002",
  customerId: customer._id,
  confirmationNumber: "BKG-TARIFF-TEST",
  status: "confirmed",
  checkinDate: "2026-10-10",
  checkoutDate: "2026-10-13",
  guestCount: 10,
  rooms: [],
  requestedRooms: [
    { roomType: "Family", quantity: 2, bedsPerRoom: 4, tariffPerRoom: 4000 },
    {
      roomType: "Garden - Non-AC",
      quantity: 1,
      bedsPerRoom: 2,
      tariffPerRoom: 2500,
    },
  ],
  estimatedTotal: 10500,
  advanceReceived: 1000,
  notes: "",
  termsSnapshot: "Agreed booking terms apply.",
  version: 0,
  invoiceId: null,
  invoiceNumber: "",
  delivery: { emailSentAt: null, whatsappSentAt: null },
};
const payment = {
  _id: "64b7f19d71c6411b74000003",
  bookingId: booking._id,
  customerId: customer._id,
  receiptNumber: "REC-TARIFF-TEST",
  amount: 1000,
  method: "upi",
  type: "advance",
  reference: "",
  notes: "",
  receivedAt: "2026-10-03T10:00:00Z",
  status: "recorded",
};
const business = {
  ...defaultPreset,
  business_name: "Example Garden Hotel",
  tagline: "Your holiday address",
};
const pagination = { page: 1, totalPages: 1, totalItems: 1, pageSize: 5 };
const errors = [];
let saves = 0;
async function inspectPdf(name, required) {
  const doc = await getDocument({
    data: new Uint8Array(await readFile(new URL(name, output))),
    standardFontDataUrl,
    useSystemFonts: false,
  }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    for (const item of (await page.getTextContent()).items) {
      if (!item.str?.trim()) continue;
      text += item.str + " ";
      assert.ok(
        item.transform[4] >= 0 &&
          item.transform[4] + item.width <= page.view[2] + 1 &&
          item.transform[5] > 0 &&
          item.transform[5] < page.view[3],
        name + ": out-of-page text " + item.str,
      );
    }
    const viewport = page.getViewport({ scale: 1.3 });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    await page.render({ canvasContext: canvas.getContext("2d"), viewport })
      .promise;
    await writeFile(
      new URL(name.replace(".pdf", "-page-" + i + ".png"), output),
      canvas.toBuffer("image/png"),
    );
  }
  for (const value of required)
    assert.ok(text.includes(value), name + ": missing " + value);
  if (name.includes("blank-preference"))
    assert.ok(text.includes("Standard"), "Blank preferences default to Standard");
  if (/^(browser|email)-(modern|slip)\.pdf$/.test(name)) {
    assert.ok(
      text.includes("Garden - Non-AC"),
      "Preserve custom preference in PDF",
    );
  }
  console.log(name + ": verified " + doc.numPages + " page(s)");
  await doc.destroy();
}
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
  headless: true,
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error(e.message);
  });
  // Every API is intercepted, including email calls: never use a real tenant.
  await context.route("**/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    let data,
      status = 200;
    if (path === "/api/auth/me")
      data = {
        authenticated: true,
        authRequired: true,
        user: { displayName: "Test Owner", role: "owner" },
        organization: { name: business.business_name, role: "owner" },
        csrfToken: "test-csrf",
        sessionExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      };
    else if (path === "/api/settings")
      data = {
        preset: business,
        logoDataUrl: null,
        taxPresets: defaultTaxPresets,
      };
    else if (path.endsWith("/next-number")) data = { invNo: "INV-TEST" };
    else if (path === "/api/invoices/workbench")
      data = {
        rows: [],
        counts: {
          all: 0,
          draft: 0,
          reserved: 0,
          checkedIn: 0,
          checkedOut: 0,
          cancelled: 0,
        },
      };
    else if (path === "/api/customers/search")
      data = {
        items: [{ ...customer, phoneMasked: "+91 ******0000" }],
        pagination,
      };
    else if (path === "/api/customers/" + customer._id) data = customer;
    else if (path === "/api/bookings" && req.method() === "POST") {
      const payload = req.postDataJSON();
      assert.equal(createBookingSchema.safeParse(payload).success, true);
      assert.equal(
        createBookingSchema.safeParse({
          ...payload,
          requestedRooms: [
            { ...payload.requestedRooms[0], roomType: "x".repeat(81) },
          ],
        }).success,
        false,
      );
      assert.equal(req.headers()["x-csrf-token"], "test-csrf");
      assert.equal(payload.estimatedTotal, 10500);
      assert.deepEqual(payload.requestedRooms, booking.requestedRooms);
      saves++;
      data = { booking, payment };
    } else if (path === "/api/bookings")
      data = {
        items: [booking],
        pagination,
        summary: { total: 1, open: 1, confirmed: 1 },
      };
    else if (path.endsWith("/payments/" + payment._id + "/receipt"))
      data = { booking, payment, customer, business, logoDataUrl: null };
    else if (path.endsWith("/payments")) data = [payment];
    else if (path === "/api/bookings/" + booking._id) data = booking;
    else if (path.includes("/reference-data/")) data = [];
    else {
      errors.push("Unexpected API " + req.method() + " " + path);
      console.error(errors.at(-1));
      status = 404;
      data = { message: "Unexpected test API" };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.goto(process.env.UI_TEST_ORIGIN || "http://localhost:5173");
  await page.getByRole("button", { name: "Customers", exact: true }).click();
  await page
    .locator(".customer-directory-row")
    .filter({ hasText: customer.name })
    .click();
  await page.getByRole("button", { name: "New booking", exact: true }).click();
  const modal = page.getByRole("dialog", {
    name: "Create a booking",
    exact: true,
  });
  await modal
    .locator('[data-booking-field="checkinDate"]')
    .fill(booking.checkinDate);
  await modal.locator('input[type="date"]').nth(1).fill(booking.checkoutDate);
  const first = modal.locator(".booking-request-row").nth(0);
  await first.getByLabel("Rooms", { exact: true }).fill("2");
  await first.getByLabel("Beds each", { exact: true }).fill("4");
  await first.getByRole("button", { name: "Show room preferences" }).click();
  await page.screenshot({
    path: fileURLToPath(new URL("preference-options-desktop.png", output)),
  });
  await first.getByRole("option", { name: "Family", exact: true }).click();
  assert.equal(
    await first.getByLabel("Preference", { exact: true }).inputValue(),
    "Family",
  );
  await page.getByLabel("Tariff per room 1").fill("4000");
  await modal.getByRole("button", { name: "Add combination" }).click();
  const second = modal.locator(".booking-request-row").nth(1);
  const preference = second.getByLabel("Preference", { exact: true });
  await preference.fill("delu");
  assert.equal(
    await second.getByRole("option", { name: "Deluxe", exact: true }).count(),
    1,
  );
  await preference.press("ArrowDown");
  await preference.press("Enter");
  assert.equal(await preference.inputValue(), "Deluxe");
  await second.getByRole("button", { name: "Clear preference" }).click();
  assert.equal(await preference.inputValue(), "");
  await preference.fill("Garden - Non-AC");
  await second
    .getByRole("option", { name: 'Use "Garden - Non-AC"', exact: true })
    .click();
  await second.getByLabel("Beds each", { exact: true }).fill("2");
  await page.getByLabel("Tariff per room 2").fill("2500");
  assert.equal(await modal.getByLabel("Estimated total").inputValue(), "10500");
  assert.equal(await modal.getByLabel("Expected occupancy").inputValue(), "10");
  assert.equal(
    await modal.getByLabel("Estimated total").getAttribute("readonly"),
    "",
  );
  await modal.locator('[data-booking-field="advanceAmount"]').fill("1000");
  await modal.getByLabel("Email PDF receipt").uncheck();
  await page.screenshot({
    path: fileURLToPath(new URL("booking-desktop.png", output)),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await first.getByRole("button", { name: "Show room preferences" }).click();
  await page.screenshot({
    path: fileURLToPath(new URL("preference-options-mobile.png", output)),
  });
  await first.getByLabel("Preference", { exact: true }).press("Escape");
  await page.screenshot({
    path: fileURLToPath(new URL("booking-mobile.png", output)),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "mobile overflow",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Tariff per room 2").fill("1.001");
  await modal
    .getByRole("button", { name: "Save booking", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Room tariff is missing or invalid" })
    .waitFor();
  assert.equal(saves, 0);
  await page.getByRole("button", { name: "Close error message" }).click();
  await page.getByLabel("Tariff per room 2").fill("2500");
  await modal
    .getByRole("button", { name: "Save booking", exact: true })
    .click();
  await modal.waitFor({ state: "hidden" });
  assert.equal(saves, 1);
  // Reopening an existing booking must preserve a manually entered preference.
  await page.getByTitle("Edit stay details", { exact: true }).click();
  const editModal = page.getByRole("dialog", {
    name: "Edit booking",
    exact: true,
  });
  assert.equal(
    await editModal
      .getByLabel("Preference", { exact: true })
      .nth(1)
      .inputValue(),
    "Garden - Non-AC",
  );
  await editModal.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: /Advance payment receipts/ }).click();
  for (const [title, name] of [
    ["Download advance receipt", "browser-modern.pdf"],
    ["Download booking slip", "browser-slip.pdf"],
  ]) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      name === "browser-slip.pdf"
        ? page.evaluate(
            async (receipt) => {
              const { downloadStyledBookingSlip } =
                await import("/src/utils/styledBookingSlipPdf.ts");
              downloadStyledBookingSlip(receipt);
            },
            { booking, payment, customer, business, logoDataUrl: null },
          )
        : page.getByTitle(title, { exact: true }).click(),
    ]);
    await download.saveAs(fileURLToPath(new URL(name, output)));
    await inspectPdf(name, [
      "Accommodation tariffs - entire stay",
      "4,000.00",
      "8,000.00",
      "2,500.00",
      "10,500.00",
    ]);
  }
  const [blankDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.evaluate(
      async (receipt) => {
        const { downloadBookingReceipt } =
          await import("/src/utils/bookingReceiptPdf.ts");
        downloadBookingReceipt(receipt);
      },
      {
        booking: {
          ...booking,
          requestedRooms: [{ ...booking.requestedRooms[0], roomType: "" }],
        },
        payment,
        customer,
        business,
        logoDataUrl: null,
      },
    ),
  ]);
  await blankDownload.saveAs(
    fileURLToPath(new URL("browser-blank-preference.pdf", output)),
  );
  await inspectPdf("browser-blank-preference.pdf", ["Standard"]);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
const input = {
  businessName: business.business_name,
  businessTagline: business.tagline,
  customerName: customer.name,
  confirmationNumber: booking.confirmationNumber,
  receiptNumber: payment.receiptNumber,
  checkinDate: booking.checkinDate,
  checkoutDate: booking.checkoutDate,
  guestCount: booking.guestCount,
  requestedRooms: booking.requestedRooms,
  amountMinor: 100000,
  estimatedTotalMinor: 1050000,
  advanceBalanceMinor: 100000,
  paymentMethod: "upi",
  receivedAt: payment.receivedAt,
  terms: booking.termsSnapshot,
};
for (const [name, build] of [
  ["email-modern.pdf", buildBookingReceiptPdf],
  ["email-slip.pdf", buildBookingSlipPdf],
]) {
  await writeFile(new URL(name, output), build(input));
  await inspectPdf(name, [
    "Accommodation tariffs - entire stay",
    "4,000.00",
    "8,000.00",
    "2,500.00",
    "10,500.00",
  ]);
}
await writeFile(
  new URL("email-blank-preference.pdf", output),
  buildBookingReceiptPdf({
    ...input,
    requestedRooms: [{ ...input.requestedRooms[0], roomType: "" }],
  }),
);
await inspectPdf("email-blank-preference.pdf", ["Standard"]);
if (!process.argv.includes("--preferences-only")) {
  const long = {
    ...input,
    requestedRooms: Array.from({ length: 12 }, (_, index) => ({
      quantity: 1,
      bedsPerRoom: 2,
      roomType:
        "Long accommodation preference for a family with a balcony and a garden view " +
        index,
      tariffPerRoom: 12345678.99,
    })),
    terms: "Long agreed booking terms and conditions. ".repeat(60),
  };
  await writeFile(
    new URL("email-large-plan.pdf", output),
    buildBookingReceiptPdf(long),
  );
  await inspectPdf("email-large-plan.pdf", ["garden view", "1,23,45,678.99"]);
}
console.log(
  "UI, save payload, persistent validation, responsive layout and PDF checks passed. Synthetic data only.",
);
