import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { CalculatedLineItem, Invoice, Settings, TaxPreset } from "../types";
import { numWords } from "./calculations";
import { formatDate } from "./dates";

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

class SinglePageOverflow extends Error {}

const invoiceLineDescription = (
  item: CalculatedLineItem,
  taxPresets: TaxPreset[],
) => {
  const savedDescription = item.description?.trim();
  if (savedDescription || item.presetKey === "Custom") {
    return savedDescription || "";
  }

  return (
    taxPresets.find((preset) => preset.key === item.presetKey)?.note.trim() ||
    ""
  );
};

export function buildInvoicePdf(
  invoice: Invoice,
  settings: Settings,
) {
  for (const compact of [false, true]) {
    try {
      const doc = renderSinglePageInvoice(invoice, settings, compact);
      doc.save(`Invoice_${invoice.invNo}.pdf`);
      return;
    } catch (error) {
      if (!(error instanceof SinglePageOverflow)) throw error;
    }
  }
  throw new Error(
    "This invoice contains too much content for one readable A4 page. Shorten lengthy descriptions or reduce the number of charges before downloading. No PDF was created.",
  );
}

function renderSinglePageInvoice(invoice: Invoice, settings: Settings, compact: boolean) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const marginLeft = 14;
  const marginRight = 14;
  const right = pageWidth - marginRight;
  let y = 13;
  const contentBottom = pageHeight - 18;
  const ensureRoom = (height: number) => {
    if (y + height <= contentBottom) return;
    throw new SinglePageOverflow();
  };
  // Saved snapshots remain audit records; printed company details use the current profile.
  const { preset, logoDataUrl, taxPresets } = settings;

  doc.setProperties({
    title: `Invoice ${invoice.invNo}`,
    subject: "GST Invoice",
    author: preset.business_name,
  });

  const accent = [128, 56, 72] as const;
  const brandX = marginLeft + 6;
  const logoBoxWidth = 25;
  const logoBoxHeight = 22;
  let hasLogo = false;
  if (logoDataUrl) {
    try {
      const properties = doc.getImageProperties(logoDataUrl);
      const scale = Math.min(
        logoBoxWidth / properties.width,
        logoBoxHeight / properties.height,
      );
      const width = properties.width * scale;
      const height = properties.height * scale;
      doc.addImage(
        logoDataUrl,
        imageFormat(logoDataUrl),
        right - width,
        y + (logoBoxHeight - height) / 2,
        width,
        height,
        undefined,
        "FAST",
      );
      hasLogo = true;
    } catch {
      hasLogo = false;
    }
  }

  const nameWidth = right - brandX - (hasLogo ? logoBoxWidth + 10 : 0);
  doc.setFont("times", "normal");
  doc.setTextColor(64, 43, 49);
  let nameSize = 24;
  doc.setFontSize(nameSize);
  const businessName = preset.business_name?.trim() || "Invoice";
  let nameLines = doc.splitTextToSize(businessName, nameWidth);
  while (nameLines.length > 2 && nameSize > 16) {
    nameSize -= 1;
    doc.setFontSize(nameSize);
    nameLines = doc.splitTextToSize(businessName, nameWidth);
  }
  doc.text(nameLines, brandX, y + 9);
  let nameBottom = y + 9 + (nameLines.length - 1) * nameSize * 1.15 / doc.internal.scaleFactor;
  if (preset.tagline) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(121, 92, 100);
    const taglineLines = doc.splitTextToSize(preset.tagline, nameWidth);
    doc.text(taglineLines, brandX, nameBottom + 5);
    nameBottom += 5 + (taglineLines.length - 1) * 3.5;
  }
  const brandBottom = Math.max(nameBottom + 1, y + (hasLogo ? logoBoxHeight : 0));
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.9);
  doc.line(marginLeft, y, marginLeft, brandBottom);
  y = brandBottom + (compact ? 4 : 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(55, 60, 70);
  const addresses = [preset.address_line1, preset.address_line2].filter(Boolean) as string[];
  const contacts = [
    preset.phone ? `Ph: ${preset.phone}` : "",
    preset.fax ? `Fax: ${preset.fax}` : "",
    preset.email ? `Mail: ${preset.email}` : "",
    preset.website ? `Web: ${preset.website}` : "",
  ].filter(Boolean);
  const contactWidth = right - brandX - 60;
  const contactStartY = y;
  let contactY = contactStartY;
  [...addresses, ...contacts].forEach((row) => {
    const lines = doc.splitTextToSize(row, contactWidth) as string[];
    doc.text(lines, brandX, contactY);
    contactY += lines.length * 3.6 + 0.6;
  });

  const titleY = Math.max(contactStartY + 3, contactY - 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(17);
  doc.setTextColor(...accent);
  doc.text("GST Invoice", right, titleY, { align: "right" });
  doc.setFontSize(8);
  doc.setTextColor(100, 96, 95);
  const referenceLines = doc.splitTextToSize(invoice.invNo, 50) as string[];
  doc.text(referenceLines, right, titleY + 6, { align: "right" });
  y = Math.max(contactY, titleY + 6 + (referenceLines.length - 1) * 3.3) + 5;
  doc.setDrawColor(172, 142, 151);
  doc.setLineWidth(0.25);
  doc.line(marginLeft, y, right, y);
  y += 6;
  if (preset.gstin) {
    doc.text(`GSTIN: ${preset.gstin}`, marginLeft, y);
  }
  doc.text(`Issued: ${formatDate(invoice.invDate)}`, right, y, { align: "right" });
  doc.setDrawColor(229, 232, 230);
  doc.setLineWidth(0.2);
  doc.line(marginLeft, y + 4, right, y + 4);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(26, 35, 50);
  doc.setFontSize(9);
  const billingHeaderY = y;
  const infoX = right - 52;
  doc.text("Bill To", marginLeft, billingHeaderY);
  doc.text("Invoice", infoX, billingHeaderY);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(40, 40, 40);
  const partyNameLines = doc.splitTextToSize(invoice.partyName, 82) as string[];
  partyNameLines.forEach((line) => {
    doc.text(line, marginLeft, y);
    y += 4.2;
  });
  if (invoice.partyAddress?.trim()) {
    doc
      .splitTextToSize(invoice.partyAddress.trim(), 82)
      .forEach((line: string) => {
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
    ["Group", invoice.groupName?.trim() || ""],
  ].filter(([, value]) => value.trim());
  const infoRows = [
    ["No.", invoice.invNo],
    ["Date", formatDate(invoice.invDate)],
    ...optionalInfoRows,
  ];
  let rowY = infoY;
  infoRows.forEach(([label, value]) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90, 90, 90);
    doc.text(label, infoX, rowY);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(26, 35, 50);
    const lines = doc.splitTextToSize(value, 36) as string[];
    doc.text(lines, right, rowY, { align: "right" });
    rowY += Math.max(4.8, lines.length * 3.6 + 1);
  });

  y = Math.max(y + 3, rowY + 3);
  ensureRoom(10);

  autoTable(doc, {
    startY: y,
    head: [
      [
        "Date",
        "Description",
        "HSN",
        "Qty",
        "Rate",
        "Taxable",
        "GST Breakup",
        "Subtotal",
      ],
    ],
    body: invoice.lineItems.map((item) => {
      const gstLines = [
        item.cgstAmount > 0
          ? `CGST ${item.cgstRate}%: ${item.cgstAmount.toFixed(2)}`
          : "",
        item.sgstAmount > 0
          ? `SGST ${item.sgstRate}%: ${item.sgstAmount.toFixed(2)}`
          : "",
        item.igstAmount > 0
          ? `IGST ${item.igstRate}%: ${item.igstAmount.toFixed(2)}`
          : "",
      ].filter(Boolean);

      return [
        formatDate(item.date),
        invoiceLineDescription(item, taxPresets),
        item.hsn,
        item.units.toFixed(2),
        item.rate.toFixed(2),
        item.taxable.toFixed(2),
        gstLines.length ? gstLines.join("\n") : "-",
        item.total.toFixed(2),
      ];
    }),
    styles: {
      font: "helvetica",
      fontSize: compact ? 7 : 8,
      cellPadding: compact ? 1 : 1.6,
      lineColor: [220, 220, 220],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [26, 35, 50],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 46, overflow: "linebreak" },
      2: { cellWidth: 16 },
      3: { cellWidth: 12, halign: "right", overflow: "linebreak" },
      4: { cellWidth: 20, halign: "right", overflow: "linebreak" },
      5: { cellWidth: 20, halign: "right", overflow: "linebreak" },
      6: { cellWidth: 28, overflow: "linebreak" },
      7: { cellWidth: 22, halign: "right", overflow: "linebreak" },
    },
    margin: { left: marginLeft, right: marginRight, top: 16, bottom: 18 },
    theme: "grid",
  });

  y =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || y) + 8;

  if (doc.getNumberOfPages() !== 1) throw new SinglePageOverflow();
  y -= 2;
  const summaryX = right - 82;
  const detailTop = y;
  const detailFont = compact ? 7 : 8;
  const rowHeight = compact ? 3.8 : 4.3;
  const summary = [
    ["Taxable Value", invoice.totalTaxable],
    ["CGST", invoice.totalCGST],
    ["SGST", invoice.totalSGST],
    ["IGST", invoice.totalIGST],
    ["Grand Total", invoice.grandTotal],
  ];
  doc.setFontSize(detailFont);
  summary.forEach(([label, value]) => {
    doc.setFont("helvetica", label === "Grand Total" ? "bold" : "normal");
    doc.setTextColor(55, 60, 70);
    doc.text(String(label), summaryX, y);
    doc.text(Number(value).toFixed(2), right, y, { align: "right" });
    y += rowHeight;
  });
  invoice.adjustments.forEach((adjustment) => {
    const sign = adjustment.type === "deduct" ? "-" : "+";
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(`${sign} ${adjustment.desc || "Adjustment"}`, 48) as string[];
    doc.text(lines, summaryX, y);
    doc.text(adjustment.amount.toFixed(2), right, y, { align: "right" });
    y += Math.max(rowHeight, lines.length * 3.3 + 1);
  });
  ensureRoom(10);
  doc.setDrawColor(26, 35, 50);
  doc.line(summaryX, y, right, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(26, 35, 50);
  doc.text("NET TOTAL", summaryX, y);
  doc.text(invoice.netTotal.toFixed(2), right, y, { align: "right" });
  const totalsEnd = y + 3;

  // Use the space alongside totals for payment details instead of stacking blocks.
  y = detailTop;
  const leftWidth = summaryX - marginLeft - 6;
  doc.setFontSize(detailFont);
  const amountInWords = numWords(Math.round(invoice.netTotal));
  const amountWords = amountInWords
    ? `Amount in words: Rupees ${amountInWords} Only`
    : "Amount in words: Amount exceeds the supported amount-in-words range.";
  const amountWordsLines = doc.splitTextToSize(amountWords, leftWidth) as string[];
  amountWordsLines.forEach((line) => {
    doc.text(line, marginLeft, y);
    y += 3.5;
  });
  y += 4;
  doc.text("Bank Details", marginLeft, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40, 40, 40);
  const bankLines = [
    preset.bank_acc_name ? `Name: ${preset.bank_acc_name}` : "",
    preset.bank_name ? `Bank: ${preset.bank_name}` : "",
    preset.bank_account ? `A/c: ${preset.bank_account}` : "",
    preset.bank_ifsc ? `IFSC: ${preset.bank_ifsc}` : "",
    preset.upi ? `UPI: ${preset.upi}` : "",
  ].filter(Boolean);
  bankLines.forEach((row) => {
    const lines = doc.splitTextToSize(row, leftWidth) as string[];
    lines.forEach((line) => {
      doc.text(line, marginLeft, y);
      y += 3.5;
    });
  });

  y = Math.max(y, totalsEnd) + 7;
  const disclaimer = "I agree that my liability for this bill is not waived and agree to be held personally liable if the indicated person, company, or association fails to pay these charges.";
  doc.setFontSize(7);
  const disclaimerLines = doc.splitTextToSize(disclaimer, 82) as string[];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const authorisedNameLines = doc.splitTextToSize(
    `For ${preset.business_name?.trim() || "the hotel"}`,
    right - summaryX,
  ) as string[];
  const authorisedNameHeight = (authorisedNameLines.length - 1) * 3.8;
  const signatureStartY = y;
  const signatureLineY = signatureStartY + authorisedNameHeight + 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(detailFont);
  const termsLines = doc.splitTextToSize(textOrDash(preset.terms), right - marginLeft) as string[];
  const signatureHeight = authorisedNameHeight + 18 + 9 + disclaimerLines.length * 3.3;
  ensureRoom(signatureHeight + 4 + termsLines.length * 3.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(26, 35, 50);
  doc.text("Guest Signature", marginLeft, signatureStartY);
  authorisedNameLines.forEach((line, index) => {
    doc.text(line, summaryX, signatureStartY + index * 3.8);
  });
  doc.setDrawColor(90, 90, 90);
  doc.setLineWidth(0.25);
  doc.line(marginLeft, signatureLineY, marginLeft + 78, signatureLineY);
  doc.line(summaryX, signatureLineY, right, signatureLineY);
  doc.setFontSize(7.5);
  doc.text("Authorised Signatory", summaryX, signatureLineY + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(110, 110, 110);
  doc.text("Sign above", marginLeft, signatureLineY + 5);
  doc.setTextColor(40, 40, 40);
  const disclaimerY = signatureLineY + 9;
  disclaimerLines.forEach((line, index) => {
    doc.text(line, marginLeft, disclaimerY + index * 3.3);
  });

  y = disclaimerY + disclaimerLines.length * 3.3 + 4;
  doc.setFontSize(detailFont);
  doc.setTextColor(80, 80, 80);
  termsLines.forEach((line) => {
    doc.text(line, marginLeft, y);
    y += 3.5;
  });

  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  const footerLines = doc.splitTextToSize(
    `Computer-generated invoice. ${preset.business_name || ""}${preset.gstin ? `, GSTIN: ${preset.gstin}` : ""}`,
    right - marginLeft,
  );
  doc.text(
    footerLines,
    pageWidth / 2,
    pageHeight - 8 - (footerLines.length - 1) * 3.5,
    { align: "center" },
  );
  return doc;
}
