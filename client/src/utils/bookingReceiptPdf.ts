import { jsPDF } from "jspdf";
import type { BookingReceipt } from "../types";
import { numWords } from "./calculations";

function money(value: number) {
  return `Rs. ${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

export function downloadBookingReceipt(receipt: BookingReceipt) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 18;
  const right = 192;
  const bottom = 270;
  let y = 18;
  const addPageIfNeeded = (height: number) => {
    if (y + height <= bottom) return;
    doc.addPage();
    y = 20;
  };
  const write = (label: string, value: string, offset = 48) => {
    const lines = doc.splitTextToSize(value || "-", right - left - offset);
    const rowHeight = Math.max(7, lines.length * 4.2 + 2);
    addPageIfNeeded(rowHeight);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(91, 96, 106);
    doc.text(label, left, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(18, 28, 43);
    doc.text(lines, left + offset, y);
    y += rowHeight;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(18, 28, 43);
  const businessName = doc.splitTextToSize(
    receipt.business.business_name || "Booking Receipt",
    115,
  );
  doc.text(businessName, left, y);
  y += businessName.length * 6.5 + 2;
  doc.setFontSize(11);
  doc.text("ADVANCE PAYMENT RECEIPT", left, y);
  doc.setFontSize(10);
  doc.text(receipt.payment.receiptNumber, right, y, { align: "right" });
  y += 5;
  doc.setDrawColor(205, 207, 211);
  doc.line(left, y, right, y);
  y += 10;

  write("Received from", receipt.customer.name);
  write("Phone", receipt.customer.phone);
  write("Confirmation", receipt.booking.confirmationNumber);
  write("Arrival", receipt.booking.checkinDate);
  write("Departure", receipt.booking.checkoutDate);
  write("Occupancy", String(receipt.booking.guestCount));
  write(
    "Room request",
    receipt.booking.requestedRooms
      .map(
        (request) =>
          `${request.quantity} x ${request.bedsPerRoom}-bed${request.roomType ? ` ${request.roomType}` : ""} room${request.quantity === 1 ? "" : "s"}`,
      )
      .join(", ") || "Not recorded",
  );
  write("Payment method", receipt.payment.method);
  write(
    "Payment date",
    new Date(receipt.payment.receivedAt).toLocaleString("en-IN"),
  );

  y += 3;
  addPageIfNeeded(18);
  doc.setFillColor(245, 247, 249);
  doc.roundedRect(left, y, right - left, 18, 2, 2, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(91, 96, 106);
  doc.text("Advance received", left + 6, y + 11);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(18, 28, 43);
  doc.text(money(receipt.payment.amount), right - 6, y + 11, {
    align: "right",
  });
  y += 28;

  addPageIfNeeded(10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Terms and conditions", left, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(70, 74, 82);
  const terms = doc.splitTextToSize(
    receipt.booking.termsSnapshot || "Terms were not recorded.",
    right - left,
  );
  for (const line of terms) {
    addPageIfNeeded(5);
    doc.text(line, left, y);
    y += 4.5;
  }
  y += 12;
  addPageIfNeeded(12);
  doc.setDrawColor(18, 28, 43);
  doc.line(132, y, right, y);
  doc.setFontSize(8);
  doc.setTextColor(91, 96, 106);
  doc.text("Authorized signature", right, y + 5, { align: "right" });
  doc.text(
    "This computer-generated receipt records an advance against the booking above.",
    left,
    286,
  );

  doc.save(`${receipt.payment.receiptNumber}.pdf`);
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

function amountInWords(value: number) {
  const safeValue = Math.max(0, value);
  const rupees = Math.floor(safeValue);
  const paise = Math.round((safeValue - rupees) * 100);
  const rupeeWords = numWords(rupees) || "Amount exceeds supported limit";
  const paiseWords = paise ? numWords(paise) : null;
  return `${rupeeWords} Rupees${paiseWords ? ` and ${paiseWords} Paise` : ""} Only`;
}

function safeFilenamePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-") || "payment";
}

export function downloadBookingSlip(receipt: BookingReceipt) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = 297;
  const pageHeight = 210;
  const burgundy = [137, 45, 39] as const;
  const ink = [29, 37, 48] as const;
  const muted = [101, 103, 108] as const;
  const line = [210, 197, 184] as const;
  const left = 15;
  const right = 282;
  const detailsRight = 205;

  doc.setFillColor(252, 249, 243);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setDrawColor(...line);
  doc.setLineWidth(0.5);
  doc.rect(8, 8, pageWidth - 16, pageHeight - 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...muted);
  doc.text("Receipt", left, 18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...ink);
  doc.text(receipt.payment.receiptNumber, left, 24);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...muted);
  doc.text("Issued", right, 18, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...ink);
  doc.text(
    new Date(receipt.payment.receivedAt).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    right,
    24,
    { align: "right" },
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...burgundy);
  doc.text("BOOKING SLIP", pageWidth / 2, 21, { align: "center" });
  doc.setFontSize(14);
  doc.setTextColor(...ink);
  const businessName = doc.splitTextToSize(
    receipt.business.business_name || "Booking Receipt",
    150,
  );
  doc.text(businessName, pageWidth / 2, 31, { align: "center" });
  let businessY = 31 + businessName.length * 5.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...muted);
  const address = [
    receipt.business.address_line1,
    receipt.business.address_line2,
  ]
    .filter(Boolean)
    .join(", ");
  if (address) {
    doc.text(address, pageWidth / 2, businessY, { align: "center" });
    businessY += 4.5;
  }
  const contact = [
    receipt.business.phone ? `Phone: ${receipt.business.phone}` : "",
    receipt.business.email,
    receipt.business.website,
  ]
    .filter(Boolean)
    .join("  |  ");
  if (contact) {
    doc.text(contact, pageWidth / 2, businessY, { align: "center" });
    businessY += 4;
  }
  const dividerY = Math.max(52, businessY + 2);
  doc.setDrawColor(...burgundy);
  doc.setLineWidth(0.7);
  doc.line(left, dividerY, right, dividerY);

  const labelX = left + 2;
  const valueX = 72;
  const maxValueWidth = detailsRight - valueX - 5;
  let y = dividerY + 14;
  const writeField = (label: string, value: string, minimumHeight = 13) => {
    const valueLines = doc.splitTextToSize(value || "-", maxValueWidth);
    const rowHeight = Math.max(minimumHeight, valueLines.length * 5 + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    doc.setTextColor(...burgundy);
    doc.text(label.toUpperCase(), labelX, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...ink);
    doc.text(valueLines, valueX, y);
    doc.setDrawColor(...line);
    doc.setLineWidth(0.25);
    doc.line(valueX, y + rowHeight - 5, detailsRight, y + rowHeight - 5);
    y += rowHeight;
  };

  writeField("Received with thanks from", receipt.customer.name);
  writeField(
    "Advance received",
    `${money(receipt.payment.amount)}  (${amountInWords(receipt.payment.amount)})`,
    17,
  );
  writeField("Towards booking of", requestedRoomSummary(receipt));
  writeField(
    "Stay and occupancy",
    `${receipt.booking.checkinDate} to ${receipt.booking.checkoutDate}  |  ${receipt.booking.guestCount} guest${receipt.booking.guestCount === 1 ? "" : "s"}`,
  );
  writeField("Confirmation number", receipt.booking.confirmationNumber);

  const summaryX = 214;
  const summaryY = dividerY + 13;
  const summaryWidth = 66;
  const summaryRows = [
    ["Total tariff", receipt.booking.estimatedTotal],
    ["Advance paid", receipt.booking.advanceReceived],
    [
      "Amount due",
      Math.max(
        0,
        receipt.booking.estimatedTotal - receipt.booking.advanceReceived,
      ),
    ],
  ] as const;
  doc.setFillColor(255, 252, 247);
  doc.setDrawColor(...burgundy);
  doc.setLineWidth(0.45);
  doc.roundedRect(summaryX, summaryY, summaryWidth, 58, 1.5, 1.5, "FD");
  summaryRows.forEach(([label, amount], index) => {
    const rowY = summaryY + index * 19.33;
    if (index) doc.line(summaryX, rowY, summaryX + summaryWidth, rowY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(label.toUpperCase(), summaryX + 4, rowY + 7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...ink);
    doc.text(money(amount), summaryX + summaryWidth - 4, rowY + 14, {
      align: "right",
    });
  });

  const termsTop = Math.max(144, y + 2);
  doc.setDrawColor(...line);
  doc.setLineWidth(0.3);
  doc.line(left, termsTop, right, termsTop);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...burgundy);
  doc.text("TERMS AND CONDITIONS", left, termsTop + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(...ink);
  const terms = doc.splitTextToSize(
    receipt.booking.termsSnapshot || "Terms were not recorded.",
    188,
  );
  const availableTermLines = Math.max(
    1,
    Math.floor((187 - (termsTop + 13)) / 3.4) + 1,
  );
  doc.text(terms.slice(0, availableTermLines), left + 4, termsTop + 13);

  const signatureY = 178;
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.45);
  doc.line(221, signatureY, right, signatureY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text("Authorized signature", right, signatureY + 5, { align: "right" });
  doc.text(`Payment method: ${receipt.payment.method}`, left, 190);
  doc.text(
    "Computer-generated booking slip. Verify the booking reference before accepting it.",
    right,
    190,
    { align: "right" },
  );

  doc.save(
    `booking-slip-${safeFilenamePart(receipt.payment.receiptNumber)}.pdf`,
  );
}
