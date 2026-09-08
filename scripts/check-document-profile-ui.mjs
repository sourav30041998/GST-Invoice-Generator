import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defaultPreset, defaultTaxPresets } from "../client/src/constants.ts";
import { buildBookingReceiptPdf, buildBookingSlipPdf } from "../server/src/services/bookingReceiptPdfService.ts";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { getDocument, OPS } = await import(process.env.PDFJS_MODULE || "pdfjs-dist/legacy/build/pdf.mjs");
const output = new URL("../output/document-profile/", import.meta.url);
await mkdir(output, { recursive: true });
const previous = { ...defaultPreset, business_name: "Previous Hotel", bank_account: "OLDACCOUNT", email: "previous@example.com" };
const updated = {
  ...defaultPreset, business_name: "Updated Garden Hotel", tagline: "Your updated holiday address",
  gstin: "19AAAAA0000A1Z5", address_line1: "45 Updated Garden Road", address_line2: "Updated City 700002",
  phone: "+91 90000 00002", fax: "UPDATEDFAX", website: "www.updated.example.com", email: "updated@example.com",
  bank_acc_name: "Updated Garden Hospitality", bank_name: "Updated Bank Garden Branch", bank_account: "987654321001",
  bank_ifsc: "UPDT0001234", upi: "updated@upi", invoice_prefix: "NEW", terms: "Updated invoice terms apply here.",
};
let settings = { preset: previous, logoDataUrl: null, taxPresets: defaultTaxPresets };
const customer = { _id: "test-customer", name: "Example Guest", phone: "+919000000000", email: "guest@example.com", address: "", state: "", notes: "", whatsappOptIn: false, status: "active", version: 1, bookingCount: 1 };
const booking = {
  _id: "test-booking", customerId: customer._id, confirmationNumber: "BKG-UNCHANGED", status: "confirmed",
  checkinDate: "2026-09-10", checkoutDate: "2026-09-12", guestCount: 2, rooms: [],
  requestedRooms: [{ quantity: 1, bedsPerRoom: 2, roomType: "Standard" }],
  estimatedTotal: 5000, advanceReceived: 1000, notes: "", termsSnapshot: "Agreed booking terms stay unchanged.",
  invoiceId: null, invoiceNumber: "", delivery: { emailSentAt: null, whatsappSentAt: null }, version: 0,
};
const payment = { _id: "test-payment", bookingId: booking._id, customerId: customer._id, receiptNumber: "REC-UNCHANGED", amount: 1000, method: "upi", type: "advance", reference: "", notes: "", receivedAt: "2026-09-08T10:00:00.000Z", status: "recorded" };
const invoice = {
  invNo: "OLD-2609-0001", invDate: "2026-09-08", partyName: customer.name, partyAddress: "Unchanged guest address", partyState: "West Bengal", partyGSTIN: "",
  checkinDate: booking.checkinDate, checkoutDate: booking.checkoutDate, roomNo: "101", groupName: "", confirmNo: booking.confirmationNumber,
  presetSnapshot: previous, lineItems: [{ date: "2026-09-10", presetKey: "Custom", description: "Booked accommodation", hsn: "996311", units: 1, rate: 1000, cgstRate: 6, sgstRate: 6, igstRate: 0, taxInclusive: false, taxable: 1000, cgstAmount: 60, sgstAmount: 60, igstAmount: 0, total: 1120 }],
  adjustments: [], totalTaxable: 1000, totalCGST: 60, totalSGST: 60, totalIGST: 0, grandTotal: 1120, netTotal: 1120, addTotal: 0, deductTotal: 0, status: "active", workflowStatus: "checkedOut", version: 0,
};
const originalInvoice = structuredClone(invoice);
const pagination = { page: 1, totalPages: 1, totalItems: 1, pageSize: 5 };
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
const errors = [];
let failSettings = false;
let settingsReads = 0;
let receiptReads = 0;
let savedProfiles = 0;
let downloads = 0;

async function inspectPdf(name, required, forbidden = [], expectLogo = false) {
  const data = await readFile(new URL(name, output));
  const doc = await getDocument({ data: new Uint8Array(data), useSystemFonts: true }).promise;
  const text = [];
  let images = 0;
  for (let index = 1; index <= doc.numPages; index++) {
    const page = await doc.getPage(index);
    const content = await page.getTextContent();
    const view = page.view;
    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      text.push(item.str);
      const x = item.transform[4];
      const y = item.transform[5];
      assert.ok(x >= -1 && x + item.width <= view[2] + 1 && y > 0 && y < view[3], `${name}: text outside page: ${item.str}`);
    }
    const operators = await page.getOperatorList();
    images += operators.fnArray.filter((op) => [OPS.paintImageXObject, OPS.paintInlineImageXObject].includes(op)).length;
    if (name.startsWith("invoice-")) {
      for (let op = 0; op < operators.fnArray.length; op++) {
        if (operators.fnArray[op] !== OPS.paintImageXObject) continue;
        const transformIndex = operators.fnArray.slice(0, op).lastIndexOf(OPS.transform);
        const [a, , , d, x] = operators.argsArray[transformIndex];
        const [, width, height] = operators.argsArray[op];
        assert.ok(Math.abs(Math.abs(a / d) - width / height) < 0.005, `${name}: logo must not stretch`);
        assert.ok(x >= view[2] * 0.7, `${name}: logo must stay in the right header column`);
      }
    }
  }
  const plain = text.join(" ").replace(/\s+/g, " ");
  if (name.startsWith("invoice-")) {
    assert.ok(plain.includes("Guest Signature"), `${name}: guest signature must remain`);
    assert.ok(plain.includes("Authorised Signatory"), `${name}: hotel signature must be available`);
    assert.equal(text.filter((line) => line === "Authorised Signatory").length, 1);
    assert.doesNotMatch(plain, /digitally signed|no signature required/i);
    const lastPage = await doc.getPage(doc.numPages);
    const lastContent = await lastPage.getTextContent();
    const caption = lastContent.items.find((item) => item.str === "Authorised Signatory");
    assert.ok(caption, `${name}: hotel signature should remain with the closing section`);
    const companyLine = lastContent.items.find((item) => item.str.startsWith("For "));
    assert.ok(companyLine, `${name}: company name must be on the signature page`);
    assert.ok(companyLine.transform[5] - caption.transform[5] >= 23 * 72 / 25.4 - 1, `${name}: allow handwriting space`);
  }
  for (const value of required) assert.ok(plain.includes(value.replace(/\s+/g, " ")), `${name}: missing ${value}`);
  for (const value of forbidden) assert.ok(!plain.includes(value), `${name}: stale ${value}`);
  assert.equal(images > 0, expectLogo, `${name}: logo must follow current settings`);
  console.log(`${name}: ${doc.numPages} page(s), current profile and document values verified`);
  await doc.destroy();
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("download", () => downloads++);
  // All APIs are intercepted. These tests never access live tenants or send email.
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let status = 200;
    let data;
    if (path === "/api/auth/me") {
      data = { authenticated: true, authRequired: true, user: { displayName: "Test Owner", role: "owner" }, organization: { name: previous.business_name, role: "owner" }, csrfToken: "test-csrf", sessionExpiresAt: new Date(Date.now() + 3600000).toISOString() };
    } else if (path === "/api/settings/preset" && request.method() === "PUT") {
      assert.equal(request.headers()["x-csrf-token"], "test-csrf");
      settings = { ...settings, preset: request.postDataJSON() };
      savedProfiles++;
      data = { preset: settings.preset };
    } else if (path === "/api/settings") {
      settingsReads++;
      status = failSettings ? 503 : 200;
      data = failSettings ? { message: "Company profile unavailable. Try again." } : settings;
    } else if (path === "/api/invoices") {
      data = [{ ...invoice, items: 1 }];
    } else if (path === `/api/invoices/${invoice.invNo}`) {
      data = invoice;
    } else if (path.endsWith("/next-number")) {
      data = { invNo: "NEW-2609-0002" };
    } else if (path === "/api/invoices/workbench") {
      data = { rows: [], counts: { all: 0, draft: 0, reserved: 0, checkedIn: 0, checkedOut: 0, cancelled: 0 } };
    } else if (path === "/api/customers/search") {
      data = { items: [{ ...customer, phoneMasked: "+91 ******0000" }], pagination };
    } else if (path === `/api/customers/${customer._id}`) {
      data = customer;
    } else if (path === "/api/bookings") {
      data = { items: [booking], pagination, summary: { total: 1, open: 1, confirmed: 1 } };
    } else if (path === `/api/bookings/${booking._id}/payments`) {
      data = [payment];
    } else if (path.endsWith(`/payments/${payment._id}/receipt`)) {
      receiptReads++;
      data = { booking, payment, customer, business: settings.preset, logoDataUrl: settings.logoDataUrl };
    } else if (path.includes("/reference-data/")) {
      data = [];
    } else {
      errors.push(`Unexpected API: ${request.method()} ${path}`);
      status = 404;
      data = { message: "Unexpected test API" };
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto(process.env.UI_TEST_ORIGIN || "http://localhost:5173");
  await page.getByRole("button", { name: "Company Profile", exact: true }).click();
  const labels = { business_name: "Business Name", tagline: "Tagline", gstin: "GSTIN", invoice_prefix: "Invoice Prefix", address_line1: "Address Line 1", address_line2: "Address Line 2", phone: "Phone", email: "Email", website: "Website", terms: "Invoice Terms", bank_acc_name: "Account Name", bank_name: "Bank Name", bank_account: "Account Number", bank_ifsc: "IFSC", upi: "UPI ID" };
  for (const [field, label] of Object.entries(labels)) {
    const input = field === "terms"
      ? page.locator("label.field").filter({ has: page.getByText(label, { exact: true }) }).locator("textarea")
      : page.getByLabel(label, { exact: true });
    await input.fill(updated[field]);
  }
  await page.getByRole("button", { name: "Save Company Profile", exact: true }).click();
  await page.getByText("Company profile saved.", { exact: true }).waitFor();
  assert.equal(savedProfiles, 1);
  await page.getByRole("button", { name: "Invoice History", exact: true }).click();
  const pdfButton = page.getByRole("button", { name: "PDF", exact: true });
  const download = async (button, name) => {
    const event = page.waitForEvent("download");
    await button.click();
    await (await event).saveAs(fileURLToPath(new URL(name, output)));
  };
  const invariant = [invoice.invNo, invoice.partyName, invoice.partyAddress, "Booked accommodation", "1120.00", "Bank Details"];
  const oldFields = [previous.business_name, previous.bank_account, previous.email];
  let reads = settingsReads;
  await download(pdfButton, "invoice-updated.pdf");
  assert.equal(settingsReads, reads + 1);
  await inspectPdf("invoice-updated.pdf", [...invariant, ...Object.entries(updated).filter(([key]) => !["invoice_prefix", "fax"].includes(key)).map(([, value]) => value)], oldFields);

  // Simulate another browser saving a logo and profile while this History view remains open.
  const logo = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 80;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0c754b"; ctx.fillRect(0, 0, 80, 80);
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 38px sans-serif"; ctx.fillText("GH", 10, 53);
    return canvas.toDataURL("image/png");
  });
  settings = { ...settings, preset: { ...updated, business_name: "Latest Garden Hotel" }, logoDataUrl: logo };
  await download(pdfButton, "invoice-fresh-logo.pdf");
  await inspectPdf("invoice-fresh-logo.pdf", [...invariant, settings.preset.business_name, "Fax: UPDATEDFAX"], [...oldFields, updated.business_name], true);
  for (const [shape, width, height] of [["wide", 240, 64], ["tall", 64, 160]]) {
    settings.logoDataUrl = await page.evaluate(([width, height]) => {
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#0c754b"; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff"; ctx.font = "bold 30px sans-serif"; ctx.fillText("GH", 6, 40);
      return canvas.toDataURL("image/png");
    }, [width, height]);
    await download(pdfButton, `invoice-${shape}-logo.pdf`);
    await inspectPdf(`invoice-${shape}-logo.pdf`, [...invariant, settings.preset.business_name], oldFields, true);
  }
  settings.logoDataUrl = "data:image/png;base64,invalid";
  await download(pdfButton, "invoice-invalid-logo.pdf");
  await inspectPdf("invoice-invalid-logo.pdf", [...invariant, settings.preset.business_name], oldFields);
  settings = { ...settings, logoDataUrl: null, preset: { ...settings.preset, address_line2: "", bank_account: "", phone: "", email: "", fax: "", terms: "" } };
  await download(pdfButton, "invoice-cleared.pdf");
  await inspectPdf("invoice-cleared.pdf", invariant, [...oldFields, updated.address_line2, updated.bank_account, updated.phone, updated.email, updated.terms, "UPDATEDFAX"]);

  failSettings = true;
  const priorDownloads = downloads;
  await pdfButton.click();
  await page.getByText("Company profile unavailable. Try again.", { exact: true }).waitFor();
  assert.equal(await pdfButton.isEnabled(), true);
  assert.equal(downloads, priorDownloads, "Failed refresh must not create a stale PDF");
  failSettings = false;

  settings = { ...settings, preset: {
    ...updated,
    business_name: "Updated Garden Hotel and Conference Centre for Family Holidays and Corporate Events by Garden Hospitality Private Limited",
    tagline: "A welcoming destination for memorable stays, comfortable rooms, celebrations and meetings with family and friends.",
    address_line1: "Building 45, Updated Garden Hospitality and Conference Centre, Riverside Avenue near the Central Railway Station, Garden District, West Bengal, India 700002",
    address_line2: "Reception: East Wing, Second Floor, Opposite Garden District Convention Centre, Updated City, West Bengal, India 700002",
    bank_acc_name: "Updated Garden Hotel and Conference Centre for Family Holidays and Corporate Events by Garden Hospitality Private Limited",
    bank_name: "Updated Bank of India, Commercial Banking Division, Garden Hospitality and Convention Centre Branch, Updated City, West Bengal 700002",
  }, logoDataUrl: logo };
  await download(pdfButton, "invoice-long-profile.pdf");
  await inspectPdf("invoice-long-profile.pdf", [...invariant, settings.preset.business_name, settings.preset.address_line1, settings.preset.bank_name], oldFields, true);

  settings = { ...settings, logoDataUrl: null, preset: { ...updated, address_line1: "", address_line2: "", phone: "", fax: "", email: "", website: "", gstin: "", tagline: "" } };
  await download(pdfButton, "invoice-minimal-header.pdf");
  await inspectPdf("invoice-minimal-header.pdf", [...invariant, updated.business_name], [...oldFields, updated.address_line1, updated.email, updated.gstin]);

  settings = { ...settings, preset: updated, logoDataUrl: logo };
  await page.getByRole("button", { name: "Customers", exact: true }).click();
  await page.locator(".customer-directory-row").filter({ hasText: customer.name }).click();
  await page.getByRole("button", { name: /Advance payment receipts/ }).click();
  await download(page.getByTitle("Download modern receipt", { exact: true }), "receipt-modern.pdf");
  await inspectPdf("receipt-modern.pdf", [updated.business_name, customer.name, payment.receiptNumber, booking.confirmationNumber, booking.termsSnapshot], oldFields);
  await download(page.getByTitle("Download booking slip", { exact: true }), "receipt-slip.pdf");
  await inspectPdf("receipt-slip.pdf", [updated.business_name, updated.address_line1, updated.phone, updated.email, customer.name, payment.receiptNumber, booking.termsSnapshot], oldFields, true);
  assert.equal(receiptReads, 2, "Each receipt format must fetch current business data");

  const attachmentInput = {
    businessName: updated.business_name, businessTagline: updated.tagline, businessLogoDataUrl: logo,
    businessAddressLines: [updated.address_line1, updated.address_line2], businessPhone: updated.phone, businessEmail: updated.email, businessWebsite: updated.website,
    customerName: customer.name, confirmationNumber: booking.confirmationNumber, receiptNumber: payment.receiptNumber,
    checkinDate: booking.checkinDate, checkoutDate: booking.checkoutDate, guestCount: booking.guestCount, requestedRooms: booking.requestedRooms,
    amountMinor: 100000, estimatedTotalMinor: 500000, advanceBalanceMinor: 100000, paymentMethod: "upi", receivedAt: payment.receivedAt, terms: booking.termsSnapshot,
  };
  await writeFile(new URL("email-modern.pdf", output), buildBookingReceiptPdf(attachmentInput));
  await writeFile(new URL("email-slip.pdf", output), buildBookingSlipPdf(attachmentInput));
  await inspectPdf("email-modern.pdf", [updated.business_name, customer.name, booking.confirmationNumber, booking.termsSnapshot], oldFields);
  await inspectPdf("email-slip.pdf", [updated.business_name, updated.address_line1, updated.email, customer.name, booking.termsSnapshot], oldFields, true);
  assert.deepEqual(invoice, originalInvoice, "Rendering must not mutate the stored invoice snapshot or transaction data");
  assert.deepEqual(errors, []);
  console.log("Profile save -> invoice PDF, live refresh, cleared fields, failed refresh, wrapping, both receipt downloads and email PDF renderers passed. No live data used.");
} finally {
  await browser.close();
}
