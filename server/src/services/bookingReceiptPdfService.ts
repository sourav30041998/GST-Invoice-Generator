import { jsPDF } from "jspdf";

export type BookingReceiptPdfInput = {
  businessName: string;
  businessTagline?: string;
  businessLogoDataUrl?: string | null;
  businessAddressLines?: string[];
  businessPhone?: string;
  businessEmail?: string;
  businessWebsite?: string;
  customerName: string;
  confirmationNumber: string;
  receiptNumber: string;
  checkinDate: string;
  checkoutDate: string;
  checkinTime?: string;
  checkoutTime?: string;
  guestCount: number;
  requestedRooms: Array<{
    roomType: string;
    bedsPerRoom: number;
    quantity: number;
  }>;
  amountMinor: number;
  estimatedTotalMinor?: number;
  advanceBalanceMinor?: number;
  paymentMethod: string;
  receivedAt: Date | string;
  terms: string;
};

function formatRequestedRooms(input: BookingReceiptPdfInput["requestedRooms"]) {
  const summary = input
    .map(
      (request) =>
        `${request.quantity} x ${request.bedsPerRoom}-bed${request.roomType ? ` ${request.roomType}` : ""} room${request.quantity === 1 ? "" : "s"}`,
    )
    .join(", ");
  return summary || "Not recorded";
}

function formatMoney(amountMinor: number) {
  return `INR ${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100)}`;
}

function formatSlipMoney(amountMinor: number) {
  return `Rs. ${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100)}`;
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function underHundred(value: number) {
  if (value < 20) return ONES[value];
  return `${TENS[Math.floor(value / 10)]}${value % 10 ? ` ${ONES[value % 10]}` : ""}`;
}

function underThousand(value: number): string {
  if (value < 100) return underHundred(value);
  return `${ONES[Math.floor(value / 100)]} Hundred${value % 100 ? ` ${underHundred(value % 100)}` : ""}`;
}

function amountInWords(amountMinor: number) {
  const rupees = Math.floor(Math.max(0, amountMinor) / 100);
  const paise = Math.round(Math.max(0, amountMinor) % 100);
  if (!Number.isSafeInteger(rupees) || rupees > 9_999_999_999) {
    return "Amount exceeds supported limit";
  }
  const parts = rupees
    ? [
        Math.floor(rupees / 10_000_000)
          ? `${underThousand(Math.floor(rupees / 10_000_000))} Crore`
          : "",
        Math.floor((rupees % 10_000_000) / 100_000)
          ? `${underHundred(Math.floor((rupees % 10_000_000) / 100_000))} Lakh`
          : "",
        Math.floor((rupees % 100_000) / 1_000)
          ? `${underHundred(Math.floor((rupees % 100_000) / 1_000))} Thousand`
          : "",
        rupees % 1_000 ? underThousand(rupees % 1_000) : "",
      ].filter(Boolean)
    : ["Zero"];
  return `${parts.join(" ")} Rupees${paise ? ` and ${underHundred(paise)} Paise` : ""} Only`;
}

function formatSlipDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function formatStayDate(value: string) {
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return isoDate
    ? new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }).format(new Date(`${value}T00:00:00+05:30`))
    : value;
}

function formatStayDateTime(date: string, time?: string) {
  const safeTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time || "")
    ? time!
    : "";
  if (!safeTime) return formatStayDate(date);
  const [hour, minute] = safeTime.split(":").map(Number);
  const period = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${formatStayDate(date)}, ${String(twelveHour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`;
}

function imageFormat(dataUrl: string) {
  if (/^data:image\/jpe?g/i.test(dataUrl)) return "JPEG";
  if (/^data:image\/webp/i.test(dataUrl)) return "WEBP";
  return "PNG";
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
  return fontSize;
}

function drawBusinessLogo(
  doc: jsPDF,
  input: BookingReceiptPdfInput,
  x: number,
  y: number,
  size: number,
) {
  if (input.businessLogoDataUrl) {
    try {
      const properties = doc.getImageProperties(input.businessLogoDataUrl);
      const ratio = Math.min(
        (size - 3) / properties.width,
        (size - 3) / properties.height,
      );
      const width = properties.width * ratio;
      const height = properties.height * ratio;
      doc.addImage(
        input.businessLogoDataUrl,
        imageFormat(input.businessLogoDataUrl),
        x + (size - width) / 2,
        y + (size - height) / 2,
        width,
        height,
        undefined,
        "FAST",
      );
      return;
    } catch {
      // The stored logo is optional; retain a branded initials fallback.
    }
  }

  doc.setFillColor(248, 244, 237);
  doc.setDrawColor(117, 52, 25);
  doc.setLineWidth(0.6);
  doc.roundedRect(x, y, size, size, 8, 8, "FD");
  doc.setFont("times", "bolditalic");
  doc.setTextColor(117, 52, 25);
  doc.setFontSize(15);
  doc.text(businessInitials(input.businessName), x + size / 2, y + 17, {
    align: "center",
  });
}

function formatPaymentMethod(method: string) {
  return method === "bankTransfer"
    ? "Bank transfer"
    : method.charAt(0).toUpperCase() + method.slice(1);
}

export function buildBookingReceiptPdf(input: BookingReceiptPdfInput) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const left = 18;
  const right = 192;
  const contentWidth = right - left;
  const pageBottom = 274;
  let y = 18;

  const addPageIfNeeded = (height: number) => {
    if (y + height <= pageBottom) return;
    doc.addPage();
    y = 20;
  };
  const writeRow = (label: string, value: string) => {
    const lines = doc.splitTextToSize(value || "-", 116) as string[];
    const rowHeight = Math.max(7, lines.length * 4.2 + 2);
    addPageIfNeeded(rowHeight);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(91, 96, 106);
    doc.text(label, left, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(18, 28, 43);
    doc.text(lines, left + 48, y);
    y += rowHeight;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(18, 28, 43);
  const businessName = doc.splitTextToSize(
    input.businessName || "Booking Receipt",
    132,
  ) as string[];
  doc.text(businessName, left, y);
  y += businessName.length * 6.5 + 2;
  if (input.businessTagline?.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(91, 96, 106);
    doc.text(
      doc.splitTextToSize(input.businessTagline.trim(), 132) as string[],
      left,
      y,
    );
    y += 5;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(18, 28, 43);
  doc.text("ADVANCE PAYMENT RECEIPT", left, y);
  drawBusinessLogo(doc, input, right - 25, 15, 25);

  y = Math.max(y + 7, 46);
  doc.setFontSize(10);
  doc.text(input.receiptNumber, right, y, { align: "right" });

  y += 5;
  doc.setDrawColor(205, 207, 211);
  doc.line(left, y, right, y);
  y += 10;

  writeRow("Received from", input.customerName);
  writeRow("Confirmation", input.confirmationNumber);
  writeRow("Arrival", formatStayDateTime(input.checkinDate, input.checkinTime));
  writeRow("Departure", formatStayDateTime(input.checkoutDate, input.checkoutTime));
  writeRow("Occupancy", String(input.guestCount));
  writeRow("Room request", formatRequestedRooms(input.requestedRooms));
  writeRow("Payment method", formatPaymentMethod(input.paymentMethod));
  writeRow(
    "Payment date",
    new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(input.receivedAt)),
  );

  y += 3;
  addPageIfNeeded(18);
  doc.setFillColor(245, 247, 249);
  doc.roundedRect(left, y, contentWidth, 18, 2, 2, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(91, 96, 106);
  doc.text("Advance received", left + 6, y + 11);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(18, 28, 43);
  doc.text(formatMoney(input.amountMinor), right - 6, y + 11, {
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
    input.terms || "Terms were not recorded.",
    contentWidth,
  ) as string[];
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

  return Buffer.from(doc.output("arraybuffer"));
}

export function bookingReceiptFilename(receiptNumber: string) {
  const safeReference = receiptNumber.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `advance-receipt-${safeReference || "payment"}.pdf`;
}

export function buildBookingSlipPdf(input: BookingReceiptPdfInput) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const pageWidth = 297;
  const pageHeight = 210;
  const green = [13, 78, 44] as const;
  const deepGreen = [8, 62, 35] as const;
  const burgundy = [139, 19, 22] as const;
  const ink = [27, 31, 29] as const;
  const muted = [83, 88, 84] as const;
  const line = [215, 197, 183] as const;
  const cream = [253, 250, 247] as const;

  doc.setProperties({
    title: `Booking slip ${input.receiptNumber}`,
    subject: "Advance booking receipt",
    author: input.businessName,
  });
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setDrawColor(92, 92, 92);
  doc.setLineWidth(0.35);
  doc.rect(0.6, 0.6, pageWidth - 1.2, pageHeight - 1.2);

  drawBusinessLogo(doc, input, 12, 6, 28);
  doc.setFont("times", "bolditalic");
  doc.setTextColor(...burgundy);
  const businessName = input.businessName || "Booking Receipt";
  fitFontSize(doc, businessName, 148, 23, 12);
  doc.text(businessName, 45, 19);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...deepGreen);
  fitFontSize(
    doc,
    (input.businessTagline || "ADVANCE RESERVATION").toUpperCase(),
    145,
    8.5,
    6.5,
  );
  doc.text(
    (input.businessTagline || "ADVANCE RESERVATION").toUpperCase(),
    45,
    30,
  );

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...deepGreen);
  doc.setFontSize(19);
  doc.text("BOOKING SLIP", 283, 15, { align: "right" });
  doc.setTextColor(...burgundy);
  doc.setFontSize(9.5);
  doc.text("(ADVANCE RECEIPT)", 283, 23, { align: "right" });
  doc.setFillColor(...burgundy);
  doc.roundedRect(237, 27, 46, 9, 1.5, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.3);
  fitFontSize(doc, `SL. NO.: ${input.receiptNumber}`, 42, 8.3, 6.5);
  doc.text(`SL. NO.: ${input.receiptNumber}`, 260, 33, { align: "center" });

  doc.setFillColor(...cream);
  doc.setDrawColor(...line);
  doc.setLineWidth(0.3);
  doc.roundedRect(10, 40, 277, 32, 2.5, 2.5, "FD");
  doc.line(198, 44, 198, 68);
  const address = (input.businessAddressLines || []).filter(Boolean).join(", ");
  const contactRows = [
    ["ADDRESS", address || "Not provided"],
    ["CALL", input.businessPhone || "Not provided"],
    [
      "ONLINE",
      [input.businessWebsite, input.businessEmail]
        .filter(Boolean)
        .join("  |  ") || "Not provided",
    ],
  ];
  contactRows.forEach(([label, value], index) => {
    const rowY = 48 + index * 8;
    doc.setFillColor(...deepGreen);
    doc.circle(17, rowY - 1.1, 2.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...green);
    doc.text(label, 22, rowY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...ink);
    fitFontSize(doc, value, 139, 8.3, 6.2);
    doc.text(value, 48, rowY);
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...deepGreen);
  doc.text("ISSUED ON", 207, 50);
  doc.setFontSize(10.5);
  doc.text(formatSlipDate(input.receivedAt), 245, 50, { align: "center" });
  doc.setFontSize(7.5);
  doc.text("CONFIRMATION", 207, 62);
  doc.setFontSize(9.5);
  fitFontSize(doc, input.confirmationNumber, 53, 9.5, 7);
  doc.text(input.confirmationNumber, 245, 62, { align: "center" });

  const detailRows = [
    {
      mark: "G",
      label: "RECEIVED WITH THANKS FROM",
      value: input.customerName,
      y: 78,
      height: 13,
    },
    {
      mark: "W",
      label: "A SUM OF RUPEES",
      value: amountInWords(input.amountMinor),
      y: 91,
      height: 14,
    },
    {
      mark: "Rs",
      label: "A SUM OF RS.",
      value: formatSlipMoney(input.amountMinor),
      y: 105,
      height: 13,
    },
    {
      mark: "B",
      label: "TOWARDS ADVANCE BOOKING OF",
      value: formatRequestedRooms(input.requestedRooms),
      y: 118,
      height: 17,
    },
    {
      mark: "D",
      label: "BOOKING PERIOD",
      value: `${formatStayDateTime(input.checkinDate, input.checkinTime)}   TO   ${formatStayDateTime(input.checkoutDate, input.checkoutTime)}`,
      y: 135,
      height: 13,
    },
  ];
  detailRows.forEach((row) => {
    doc.setFillColor(...deepGreen);
    doc.circle(17, row.y + 3.8, 4.1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(row.mark.length > 1 ? 6.2 : 8);
    doc.setTextColor(255, 255, 255);
    doc.text(row.mark, 17, row.y + 5.5, { align: "center" });
    doc.setFontSize(7.2);
    doc.setTextColor(...deepGreen);
    doc.text(row.label, 27, row.y + 2.5);
    doc.setFontSize(8.8);
    doc.setTextColor(...burgundy);
    const valueLines = doc.splitTextToSize(row.value || "-", 137) as string[];
    doc.text(valueLines.slice(0, 2), 27, row.y + 8.2);
    doc.setDrawColor(...line);
    doc.setLineWidth(0.22);
    doc.line(27, row.y + row.height, 166, row.y + row.height);
  });

  doc.setFillColor(...deepGreen);
  doc.circle(17, 154, 4.1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text("#", 17, 156, { align: "center" });
  doc.setFontSize(6.8);
  doc.setTextColor(...deepGreen);
  doc.text("EXPECTED GUESTS", 27, 152.5);
  doc.text("PAYMENT METHOD", 78, 152.5);
  doc.setFontSize(8.5);
  doc.setTextColor(...burgundy);
  doc.text(String(input.guestCount), 27, 158);
  doc.text(formatPaymentMethod(input.paymentMethod), 78, 158);

  const summaryX = 176;
  const summaryY = 81;
  const summaryWidth = 111;
  const summaryHeight = 75;
  doc.setFillColor(...cream);
  doc.setDrawColor(...line);
  doc.setLineWidth(0.35);
  doc.roundedRect(
    summaryX,
    summaryY,
    summaryWidth,
    summaryHeight,
    2.5,
    2.5,
    "FD",
  );
  doc.setFillColor(...burgundy);
  doc.roundedRect(197, 77, 69, 10, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("PAYMENT SUMMARY", 231.5, 83.7, { align: "center" });
  const advancePaid = input.advanceBalanceMinor ?? input.amountMinor;
  const summaryRows = [
    ["T", "TOTAL TARIFF", input.estimatedTotalMinor || 0],
    ["A", "ADVANCE PAID", advancePaid],
    [
      "D",
      "DUE AMOUNT",
      Math.max(0, (input.estimatedTotalMinor || 0) - advancePaid),
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
    doc.setTextColor(...deepGreen);
    doc.text(mark, summaryX + 11, rowTop + 7, { align: "center" });
    doc.setFontSize(8.4);
    doc.text(label, summaryX + 23, rowTop + 7);
    doc.setTextColor(...burgundy);
    fitFontSize(doc, formatSlipMoney(amount), 40, 12, 8);
    doc.text(formatSlipMoney(amount), summaryX + summaryWidth - 7, rowTop + 7, {
      align: "right",
    });
  });

  const footerY = 163;
  const footerHeight = 31;
  const drawFooterBox = (x: number, width: number) => {
    doc.setFillColor(...cream);
    doc.setDrawColor(...line);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, footerY, width, footerHeight, 2.2, 2.2, "FD");
  };
  drawFooterBox(10, 145);
  drawFooterBox(159, 59);
  drawFooterBox(222, 65);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.6);
  doc.setTextColor(...deepGreen);
  doc.text("CONDITIONS & NOTES", 17, 170);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  doc.setTextColor(...ink);
  const terms = doc.splitTextToSize(
    input.terms || "Terms were not recorded.",
    130,
  ) as string[];
  const displayedTerms = terms.slice(0, 6);
  if (terms.length > displayedTerms.length) {
    displayedTerms[displayedTerms.length - 1] =
      "Complete terms are included in the booking confirmation.";
  }
  displayedTerms.forEach((term, index) => {
    doc.setFillColor(...green);
    doc.circle(17.5, 176 + index * 3, 0.8, "F");
    doc.text(term, 20, 176.7 + index * 3);
  });

  doc.setFillColor(...deepGreen);
  doc.roundedRect(165, 170, 12, 12, 2.2, 2.2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.2);
  doc.setTextColor(255, 255, 255);
  doc.text("CALL", 171, 177.2, { align: "center" });
  doc.setTextColor(...deepGreen);
  doc.setFontSize(7.2);
  doc.text("PLEASE CONTACT US", 181, 172.8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  doc.setTextColor(...ink);
  const phoneLines = doc.splitTextToSize(
    input.businessPhone ||
      input.businessEmail ||
      "Contact details not provided",
    33,
  ) as string[];
  doc.text(phoneLines.slice(0, 3), 181, 178);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.4);
  doc.setTextColor(...burgundy);
  doc.text("AUTHORISED SIGNATORY", 254.5, 174, { align: "center" });
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.35);
  doc.line(232, 188, 278, 188);

  doc.setFillColor(...deepGreen);
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

  return Buffer.from(doc.output("arraybuffer"));
}

export function bookingSlipFilename(receiptNumber: string) {
  const safeReference = receiptNumber.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `booking-slip-${safeReference || "payment"}.pdf`;
}
