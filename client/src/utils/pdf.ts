import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Invoice } from "../types";
import { formatCurrency, numWords } from "./calculations";
import { formatDate } from "./dates";

export async function resolveLogoDataUrl(uploadedLogo: string | null) {
  return uploadedLogo || null;
}

const imageFormat = (dataUrl: string) => {
  if (/^data:image\/jpe?g/i.test(dataUrl)) {
    return "JPEG";
  }
  if (/^data:image\/webp/i.test(dataUrl)) {
    return "WEBP";
  }
  return "PNG";
};

const textOrDash = (value?: string) => value?.trim() || "-";

export function buildInvoicePdf(invoice: Invoice, logoDataUrl: string | null) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const marginLeft = 14;
  const marginRight = 14;
  const right = pageWidth - marginRight;
  let y = 13;
  const preset = invoice.presetSnapshot;

  doc.setProperties({
    title: `Invoice ${invoice.invNo}`,
    subject: "GST Invoice",
    author: preset.business_name
  });

  const logoSize = 28;
  let logoOffset = 0;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, imageFormat(logoDataUrl), marginLeft, y, logoSize, logoSize, undefined, "FAST");
      logoOffset = logoSize + 5;
    } catch {
      logoOffset = 0;
    }
  }

  const nameX = marginLeft + logoOffset;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(26, 35, 50);
  doc.setFontSize(18);
  doc.text(preset.business_name || "Invoice", nameX, y + 12);
  if (preset.tagline) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(139, 105, 20);
    doc.text(preset.tagline, nameX, y + 17);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(55, 60, 70);
  const addressLines = [
    preset.address_line1,
    preset.address_line2,
    preset.phone ? `Ph: ${preset.phone}` : "",
    preset.email ? `Mail: ${preset.email}` : "",
    preset.website ? `Web: ${preset.website}` : "",
    preset.gstin ? `GSTIN: ${preset.gstin}` : ""
  ].filter(Boolean) as string[];
  addressLines.forEach((line, index) => doc.text(line, right, y + 4 + index * 4.8, { align: "right" }));
  y += Math.max(logoSize - 2, addressLines.length * 4.8 + 8);
  doc.setDrawColor(175, 180, 192);
  doc.line(marginLeft, y, right, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(26, 35, 50);
  doc.text("GST INVOICE", pageWidth / 2, y, { align: "center" });
  y += 7;

  doc.setFontSize(9);
  const billingHeaderY = y;
  const infoX = right - 52;
  doc.text("Bill To", marginLeft, billingHeaderY);
  doc.text("Invoice", infoX, billingHeaderY);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(40, 40, 40);
  doc.text(invoice.partyName, marginLeft, y);
  y += 4.5;
  if (invoice.partyAddress?.trim()) {
    doc.splitTextToSize(invoice.partyAddress.trim(), 82).forEach((line: string) => {
      doc.text(line, marginLeft, y);
      y += 4.2;
    });
  }
  if (invoice.partyState?.trim()) {
    doc.text(invoice.partyState.trim(), marginLeft, y);
    y += 4.2;
  }
  if (invoice.partyGSTIN?.trim()) {
    doc.text(`GST No.: ${invoice.partyGSTIN.trim()}`, marginLeft, y);
    y += 4.2;
  }
  if (invoice.confirmNo?.trim()) {
    doc.text(`Confirmation No.: ${invoice.confirmNo.trim()}`, marginLeft, y);
    y += 4.2;
  }

  const infoY = billingHeaderY + 6;
  const optionalInfoRows = [
    ["Arrival", formatDate(invoice.checkinDate)],
    ["Departure", formatDate(invoice.checkoutDate)],
    ["Room", invoice.roomNo?.trim() || ""],
    ["Group", invoice.groupName?.trim() || ""]
  ].filter(([, value]) => value.trim());
  const infoRows = [
    ["No.", invoice.invNo],
    ["Date", formatDate(invoice.invDate)],
    ...optionalInfoRows
  ];
  infoRows.forEach(([label, value], index) => {
    const rowY = infoY + index * 4.8;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90, 90, 90);
    doc.text(label, infoX, rowY);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(26, 35, 50);
    doc.text(value, right, rowY, { align: "right" });
  });

  y = Math.max(y + 4, infoY + infoRows.length * 4.8 + 4);

  autoTable(doc, {
    startY: y,
    head: [["Date", "Description", "HSN", "Qty", "Rate", "Taxable", "GST Breakup", "Subtotal"]],
    body: invoice.lineItems.map((item) => {
      const gstLines = [
        item.cgstAmount > 0 ? `CGST ${item.cgstRate}%: ${item.cgstAmount.toFixed(2)}` : "",
        item.sgstAmount > 0 ? `SGST ${item.sgstRate}%: ${item.sgstAmount.toFixed(2)}` : "",
        item.igstAmount > 0 ? `IGST ${item.igstRate}%: ${item.igstAmount.toFixed(2)}` : ""
      ].filter(Boolean);

      return [
        formatDate(item.date),
        [item.presetKey && item.presetKey !== "Custom" ? item.presetKey : "", item.description].filter(Boolean).join("\n"),
        item.hsn,
        item.units.toFixed(2),
        item.rate.toFixed(2),
        item.taxable.toFixed(2),
        gstLines.length ? gstLines.join("\n") : "-",
        item.total.toFixed(2)
      ];
    }),
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2.2,
      lineColor: [220, 220, 220],
      lineWidth: 0.1
    },
    headStyles: {
      fillColor: [26, 35, 50],
      textColor: [255, 255, 255],
      fontStyle: "bold"
    },
    columnStyles: {
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      7: { halign: "right" }
    },
    margin: { left: marginLeft, right: marginRight },
    theme: "grid"
  });

  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y) + 8;

  const summaryX = right - 82;
  const amountX = right;
  const summary = [
    ["Taxable Value", invoice.totalTaxable],
    ["CGST", invoice.totalCGST],
    ["SGST", invoice.totalSGST],
    ["IGST", invoice.totalIGST],
    ["Grand Total", invoice.grandTotal]
  ];
  doc.setFontSize(9);
  summary.forEach(([label, value]) => {
    doc.setFont("helvetica", label === "Grand Total" ? "bold" : "normal");
    doc.setTextColor(55, 60, 70);
    doc.text(String(label), summaryX, y);
    doc.text(Number(value).toFixed(2), amountX, y, { align: "right" });
    y += 5;
  });

  if (invoice.adjustments.length) {
    y += 1;
    invoice.adjustments.forEach((adjustment) => {
      const sign = adjustment.type === "deduct" ? "-" : "+";
      doc.setFont("helvetica", "normal");
      doc.text(`${sign} ${adjustment.desc || "Adjustment"}`, summaryX, y);
      doc.text(adjustment.amount.toFixed(2), amountX, y, { align: "right" });
      y += 5;
    });
  }

  doc.setDrawColor(26, 35, 50);
  doc.line(summaryX, y, amountX, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(26, 35, 50);
  doc.text("NET TOTAL", summaryX, y);
  doc.text(invoice.netTotal.toFixed(2), amountX, y, { align: "right" });

  y += 11;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const amountWords = `Amount in words: Rupees ${numWords(Math.round(invoice.netTotal))} Only`;
  const amountWordsWidth = summaryX - marginLeft - 6;
  const amountWordsLines = doc.splitTextToSize(amountWords, amountWordsWidth);
  amountWordsLines.forEach((line: string, index: number) => {
    doc.text(line, marginLeft, y + index * 4.2);
  });
  y += amountWordsLines.length * 4.2 + 6;

  const bankLines = [
    preset.bank_acc_name ? `Name: ${preset.bank_acc_name}` : "",
    preset.bank_name ? `Bank: ${preset.bank_name}` : "",
    preset.bank_account ? `A/c: ${preset.bank_account}` : "",
    preset.bank_ifsc ? `IFSC: ${preset.bank_ifsc}` : "",
    preset.upi ? `UPI: ${preset.upi}` : ""
  ].filter(Boolean);
  const leftBlock = [
    "Guest Signature",
    "I agree that my liability for this bill is not waived and agree to be held personally liable if the indicated person, company, or association fails to pay these charges."
  ];
  const signatureStartY = y + 6;
  const signatureLineY = signatureStartY + 14;
  const signatureLineWidth = 78;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(26, 35, 50);
  doc.text(leftBlock[0], marginLeft, signatureStartY);
  doc.setDrawColor(90, 90, 90);
  doc.setLineWidth(0.25);
  doc.line(marginLeft, signatureLineY, marginLeft + signatureLineWidth, signatureLineY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(110, 110, 110);
  doc.text("Sign above", marginLeft, signatureLineY + 4);

  doc.setFontSize(8);
  doc.setTextColor(40, 40, 40);
  const disclaimerY = signatureLineY + 9;
  const disclaimerLines = doc.splitTextToSize(leftBlock[1], 82);
  disclaimerLines.forEach((line: string, index: number) => {
    doc.text(line, marginLeft, disclaimerY + index * 3.8);
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(26, 35, 50);
  doc.text("Bank Details", summaryX, signatureStartY);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40, 40, 40);
  bankLines.forEach((line, index) => doc.text(line, summaryX, signatureStartY + 5 + index * 4));

  const signatureEndY = disclaimerY + disclaimerLines.length * 3.8;
  const bankEndY = signatureStartY + 5 + bankLines.length * 4;
  y = Math.max(signatureEndY, bankEndY) + 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.splitTextToSize(textOrDash(preset.terms), pageWidth - marginLeft - marginRight).forEach((line: string) => {
    if (y > pageHeight - 18) {
      doc.addPage();
      y = 16;
    }
    doc.text(line, marginLeft, y);
    y += 4;
  });

  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Computer-generated invoice. ${preset.business_name || ""}${preset.gstin ? `, GSTIN: ${preset.gstin}` : ""}`,
    pageWidth / 2,
    pageHeight - 8,
    { align: "center" }
  );

  doc.save(`Invoice_${invoice.invNo}.pdf`);
}
