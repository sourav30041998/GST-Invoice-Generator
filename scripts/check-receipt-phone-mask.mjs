import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const pdfModule = process.env.PDFJS_MODULE || "pdfjs-dist/legacy/build/pdf.mjs";
const { getDocument } = await import(pdfModule);
const { createCanvas } = await import(process.env.CANVAS_MODULE || "@napi-rs/canvas");
const standardFontDataUrl = fileURLToPath(new URL("../../standard_fonts/", import.meta.resolve(pdfModule))).replaceAll("\\", "/");
const output = new URL("../output/receipt-phone-mask/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage();
  // Render only the PDF module; do not access real customers or authenticated APIs.
  await page.route("**/api/**", route => route.abort());
  await page.route("**/receipt-mask-test", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Receipt test</title>" }));
  await page.goto((process.env.UI_TEST_ORIGIN || "http://localhost:5173") + "/receipt-mask-test");
  for (const [index, [phone, expected]] of [
    ["+919876543210", "******3210"],
    ["+44 (20) 7946 0958", "******0958"],
    ["123", "****"],
    ["", "-"],
  ].entries()) {
    const name = "receipt-" + index + ".pdf";
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.evaluate(async phone => {
        const { downloadBookingReceipt } = await import("/src/utils/bookingReceiptPdf.ts");
        const receipt = {
          logoDataUrl: null,
          business: { business_name: "Example Hotel", tagline: "", checkin_time: "12:00", checkout_time: "11:00" },
          customer: { name: "Example Guest", phone },
          booking: { confirmationNumber: "BKG-TEST", checkinDate: "2026-10-10", checkoutDate: "2026-10-12", guestCount: 2, requestedRooms: [{ quantity: 1, bedsPerRoom: 2, roomType: "Standard", tariffPerRoom: 4000 }], termsSnapshot: "Agreed booking terms apply." },
          payment: { receiptNumber: "REC-TEST", method: "cash", amount: 1000, receivedAt: "2026-10-06T10:00:00Z" },
        };
        downloadBookingReceipt(receipt);
        if (receipt.customer.phone !== phone) throw new Error("Stored contact was mutated");
      }, phone),
    ]);
    await download.saveAs(fileURLToPath(new URL(name, output)));
    const doc = await getDocument({ data: new Uint8Array(await readFile(new URL(name, output))), standardFontDataUrl, useSystemFonts: false }).promise;
    assert.equal(doc.numPages, 1);
    const pdfPage = await doc.getPage(1);
    const strings = (await pdfPage.getTextContent()).items.map(item => item.str?.trim()).filter(Boolean);
    assert.equal(strings[strings.indexOf("Phone") + 1], expected);
    if (phone) assert.ok(!strings.join(" ").includes(phone), "Full phone must not appear in PDF text");
    assert.ok(strings.includes("Example Guest"));
    assert.ok(strings.includes("Advance received"));
    if (index === 0) {
      const viewport = pdfPage.getViewport({ scale: 1.2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      await writeFile(new URL("receipt-preview.png", output), canvas.toBuffer("image/png"));
    }
    await doc.destroy();
  }
  console.log("4 focused PDF checks passed: regular, formatted international, short, and missing phone. Stored contacts unchanged.");
} finally {
  await browser.close();
}
