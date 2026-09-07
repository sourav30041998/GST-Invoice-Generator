import { jsPDF } from "jspdf";
import type { BookingReceipt } from "../types";
import { numWords } from "./calculations";

const GREEN = [13, 78, 44] as const;
const DEEP_GREEN = [8, 62, 35] as const;
const BURGUNDY = [139, 19, 22] as const;
const INK = [27, 31, 29] as const;
const LINE = [215, 197, 183] as const;
const CREAM = [253, 250, 247] as const;

function money(value: number) {
  return `Rs. ${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

function amountInWords(value: number) {
  const safeValue = Math.max(0, value);
  const rupees = Math.floor(safeValue);
  const paise = Math.round((safeValue - rupees) * 100);
  const rupeeWords = numWords(rupees) || "Amount exceeds supported limit";
  const paiseWords = paise ? numWords(paise) : null;
  return `${rupeeWords} Rupees${paiseWords ? ` and ${paiseWords} Paise` : ""} Only`;
}

function requestedRoomSummary(receipt: BookingReceipt) {
  return (
    receipt.booking.requestedRooms
      .map(
        (request) =>
          `${request.quantity} x ${request.bedsPerRoom}-bed${request.roomType ? ` ${request.roomType}` : ""} room${request.quantity === 1 ? "" : "s"}`,
      )
      .join(", ") || "Not recorded"
  );
}

function formatStayDate(value: string) {
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return isoDate ? `${isoDate[3]} / ${isoDate[2]} / ${isoDate[1]}` : value;
}

function formatPaymentMethod(method: string) {
  return method === "bankTransfer"
    ? "Bank transfer"
    : method.charAt(0).toUpperCase() + method.slice(1);
}

function imageFormat(dataUrl: string) {
  if (/^data:image\/jpe?g/i.test(dataUrl)) return "JPEG";
  if (/^data:image\/webp/i.test(dataUrl)) return "WEBP";
  return "PNG";
}

function safeFilenamePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-") || "payment";
}

function businessInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return initials || "BS";
}

function fitFontSize(
  doc: jsPDF,
  text: string,
  maximumWidth: number,
  preferredSize: number,
  minimumSize: number,
) {
  let fontSize = preferredSize;
  doc.setFontSize(fontSize);
  while (fontSize > minimumSize && doc.getTextWidth(text) > maximumWidth) {
    fontSize -= 0.5;
    doc.setFontSize(fontSize);
  }
}

function drawBusinessLogo(
  doc: jsPDF,
  receipt: BookingReceipt,
  x: number,
  y: number,
  size: number,
) {
  if (receipt.logoDataUrl) {
    try {
      const properties = doc.getImageProperties(receipt.logoDataUrl);
      const ratio = Math.min(
        (size - 3) / properties.width,
        (size - 3) / properties.height,
      );
      const width = properties.width * ratio;
      const height = properties.height * ratio;
      doc.addImage(
        receipt.logoDataUrl,
        imageFormat(receipt.logoDataUrl),
        x + (size - width) / 2,
        y + (size - height) / 2,
        width,
        height,
        undefined,
        "FAST",
      );
      return;
    } catch {
      // The logo is optional; retain a branded initials fallback.
    }
  }

  doc.setFillColor(248, 244, 237);
  doc.setDrawColor(117, 52, 25);
  doc.setLineWidth(0.6);
  doc.roundedRect(x, y, size, size, 8, 8, "FD");
  doc.setFont("times", "bolditalic");
  doc.setTextColor(117, 52, 25);
  doc.setFontSize(15);
  doc.text(
    businessInitials(receipt.business.business_name),
    x + size / 2,
    y + 17,
    { align: "center" },
  );
}

export function downloadStyledBookingSlip(receipt: BookingReceipt) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = 297;
  const pageHeight = 210;

  doc.setProperties({
    title: `Booking slip ${receipt.payment.receiptNumber}`,
    subject: "Advance booking receipt",
    author: receipt.business.business_name,
  });
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setDrawColor(92, 92, 92);
  doc.setLineWidth(0.35);
  doc.rect(0.6, 0.6, pageWidth - 1.2, pageHeight - 1.2);

  drawBusinessLogo(doc, receipt, 12, 6, 28);
  doc.setFont("times", "bolditalic");
  doc.setTextColor(...BURGUNDY);
  const businessName = receipt.business.business_name || "Booking Receipt";
  fitFontSize(doc, businessName, 148, 23, 12);
  doc.text(businessName, 45, 19);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DEEP_GREEN);
  const tagline = (
    receipt.business.tagline || "ADVANCE RESERVATION"
  ).toUpperCase();
  fitFontSize(doc, tagline, 145, 8.5, 6.5);
  doc.text(tagline, 45, 30);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DEEP_GREEN);
  doc.setFontSize(19);
  doc.text("BOOKING SLIP", 283, 15, { align: "right" });
  doc.setTextColor(...BURGUNDY);
  doc.setFontSize(9.5);
  doc.text("(ADVANCE RECEIPT)", 283, 23, { align: "right" });
  doc.setFillColor(...BURGUNDY);
  doc.roundedRect(237, 27, 46, 9, 1.5, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  fitFontSize(doc, `SL. NO.: ${receipt.payment.receiptNumber}`, 42, 8.3, 6.5);
  doc.text(`SL. NO.: ${receipt.payment.receiptNumber}`, 260, 33, {
    align: "center",
  });

  doc.setFillColor(...CREAM);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.roundedRect(10, 40, 277, 32, 2.5, 2.5, "FD");
  doc.line(198, 44, 198, 68);
  const address = [
    receipt.business.address_line1,
    receipt.business.address_line2,
  ]
    .filter(Boolean)
    .join(", ");
  const contactRows = [
    ["ADDRESS", address || "Not provided"],
    ["CALL", receipt.business.phone || "Not provided"],
    [
      "ONLINE",
      [receipt.business.website, receipt.business.email]
        .filter(Boolean)
        .join("  |  ") || "Not provided",
    ],
  ];
  contactRows.forEach(([label, value], index) => {
    const rowY = 48 + index * 8;
    doc.setFillColor(...DEEP_GREEN);
    doc.circle(17, rowY - 1.1, 2.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...GREEN);
    doc.text(label, 22, rowY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    fitFontSize(doc, value, 139, 8.3, 6.2);
    doc.text(value, 48, rowY);
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...DEEP_GREEN);
  doc.text("ISSUED ON", 207, 50);
  doc.setFontSize(10.5);
  doc.text(
    new Date(receipt.payment.receivedAt).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    245,
    50,
    { align: "center" },
  );
  doc.setFontSize(7.5);
  doc.text("CONFIRMATION", 207, 62);
  fitFontSize(doc, receipt.booking.confirmationNumber, 53, 9.5, 7);
  doc.text(receipt.booking.confirmationNumber, 245, 62, { align: "center" });

  const detailRows = [
    ["G", "RECEIVED WITH THANKS FROM", receipt.customer.name, 78, 13],
    ["W", "A SUM OF RUPEES", amountInWords(receipt.payment.amount), 91, 14],
    ["Rs", "A SUM OF RS.", money(receipt.payment.amount), 105, 13],
    ["B", "TOWARDS ADVANCE BOOKING OF", requestedRoomSummary(receipt), 118, 17],
    [
      "D",
      "BOOKING PERIOD",
      `${formatStayDate(receipt.booking.checkinDate)}   TO   ${formatStayDate(receipt.booking.checkoutDate)}`,
      135,
      13,
    ],
  ] as const;
  detailRows.forEach(([mark, label, value, y, height]) => {
    doc.setFillColor(...DEEP_GREEN);
    doc.circle(17, y + 3.8, 4.1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(mark.length > 1 ? 6.2 : 8);
    doc.setTextColor(255, 255, 255);
    doc.text(mark, 17, y + 5.5, { align: "center" });
    doc.setFontSize(7.2);
    doc.setTextColor(...DEEP_GREEN);
    doc.text(label, 27, y + 2.5);
    doc.setFontSize(8.8);
    doc.setTextColor(...BURGUNDY);
    const valueLines = doc.splitTextToSize(value || "-", 137);
    doc.text(valueLines.slice(0, 2), 27, y + 8.2);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.22);
    doc.line(27, y + height, 166, y + height);
  });

  doc.setFillColor(...DEEP_GREEN);
  doc.circle(17, 154, 4.1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text("#", 17, 156, { align: "center" });
  doc.setFontSize(6.8);
  doc.setTextColor(...DEEP_GREEN);
  doc.text("EXPECTED GUESTS", 27, 152.5);
  doc.text("PAYMENT METHOD", 78, 152.5);
  doc.setFontSize(8.5);
  doc.setTextColor(...BURGUNDY);
  doc.text(String(receipt.booking.guestCount), 27, 158);
  doc.text(formatPaymentMethod(receipt.payment.method), 78, 158);

  const summaryX = 176;
  const summaryWidth = 111;
  doc.setFillColor(...CREAM);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.35);
  doc.roundedRect(summaryX, 81, summaryWidth, 75, 2.5, 2.5, "FD");
  doc.setFillColor(...BURGUNDY);
  doc.roundedRect(197, 77, 69, 10, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("PAYMENT SUMMARY", 231.5, 83.7, { align: "center" });
  const summaryRows = [
    ["T", "TOTAL TARIFF", receipt.booking.estimatedTotal],
    ["A", "ADVANCE PAID", receipt.booking.advanceReceived],
    [
      "D",
      "DUE AMOUNT",
      Math.max(
        0,
        receipt.booking.estimatedTotal - receipt.booking.advanceReceived,
      ),
    ],
  ] as const;
  summaryRows.forEach(([mark, label, amount], index) => {
    const rowTop = 90 + index * 22;
    if (index) {
      doc.setDrawColor(126, 134, 130);
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.line(
        summaryX + 4,
        rowTop - 3,
        summaryX + summaryWidth - 4,
        rowTop - 3,
      );
      doc.setLineDashPattern([], 0);
    }
    doc.setFillColor(237, 245, 239);
    doc.circle(summaryX + 11, rowTop + 5, 5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...DEEP_GREEN);
    doc.text(mark, summaryX + 11, rowTop + 7, { align: "center" });
    doc.setFontSize(8.4);
    doc.text(label, summaryX + 23, rowTop + 7);
    doc.setTextColor(...BURGUNDY);
    fitFontSize(doc, money(amount), 40, 12, 8);
    doc.text(money(amount), summaryX + summaryWidth - 7, rowTop + 7, {
      align: "right",
    });
  });

  const footerY = 163;
  const footerHeight = 31;
  const drawFooterBox = (x: number, width: number) => {
    doc.setFillColor(...CREAM);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, footerY, width, footerHeight, 2.2, 2.2, "FD");
  };
  drawFooterBox(10, 145);
  drawFooterBox(159, 59);
  drawFooterBox(222, 65);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.6);
  doc.setTextColor(...DEEP_GREEN);
  doc.text("CONDITIONS & NOTES", 17, 170);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  doc.setTextColor(...INK);
  const terms = doc.splitTextToSize(
    receipt.booking.termsSnapshot || "Terms were not recorded.",
    130,
  );
  const displayedTerms = terms.slice(0, 6);
  if (terms.length > displayedTerms.length) {
    displayedTerms[displayedTerms.length - 1] =
      "Complete terms are included in the booking confirmation.";
  }
  displayedTerms.forEach((term: string, index: number) => {
    doc.setFillColor(...GREEN);
    doc.circle(17.5, 176 + index * 3, 0.8, "F");
    doc.text(term, 20, 176.7 + index * 3);
  });

  doc.setFillColor(...DEEP_GREEN);
  doc.roundedRect(165, 170, 12, 12, 2.2, 2.2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.2);
  doc.setTextColor(255, 255, 255);
  doc.text("CALL", 171, 177.2, { align: "center" });
  doc.setTextColor(...DEEP_GREEN);
  doc.setFontSize(7.2);
  doc.text("PLEASE CONTACT US", 181, 172.8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  doc.setTextColor(...INK);
  const phoneLines = doc.splitTextToSize(
    receipt.business.phone ||
      receipt.business.email ||
      "Contact details not provided",
    33,
  );
  doc.text(phoneLines.slice(0, 3), 181, 178);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.4);
  doc.setTextColor(...BURGUNDY);
  doc.text("AUTHORISED SIGNATORY", 254.5, 174, { align: "center" });
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.35);
  doc.line(232, 188, 278, 188);

  doc.setFillColor(...DEEP_GREEN);
  doc.roundedRect(10, 198, 277, 8, 2, 2, "F");
  doc.setFont("times", "italic");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(
    "Thank you for choosing us. We look forward to hosting you!",
    pageWidth / 2,
    203.6,
    { align: "center" },
  );

  doc.save(
    `booking-slip-${safeFilenamePart(receipt.payment.receiptNumber)}.pdf`,
  );
}
