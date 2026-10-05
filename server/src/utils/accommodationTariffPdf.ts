import type { jsPDF } from "jspdf";

type TariffRow = {
  roomType: string;
  quantity: number;
  bedsPerRoom: number;
  tariffPerRoom?: number;
};

export function hasAccommodationTariffs(rows: TariffRow[]) {
  return (
    rows.length > 0 &&
    rows.every((row) => typeof row.tariffPerRoom === "number")
  );
}

const money = (value: number) =>
  `Rs. ${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function drawAccommodationTariffs(
  doc: jsPDF,
  rows: TariffRow[],
  startY: number,
  reference: string,
) {
  if (!hasAccommodationTariffs(rows)) return startY;
  const left = 18;
  const width = doc.internal.pageSize.getWidth() - 36;
  const bottom = doc.internal.pageSize.getHeight() - 27;
  const widths = [0.3, 0.08, 0.08, 0.27, 0.27].map((ratio) => width * ratio);
  let y = startY;
  const nextPage = () => {
    doc.addPage();
    y = 20;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(70, 74, 82);
    doc.text(reference, left, y);
    y += 10;
  };
  const heading = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(18, 28, 43);
    doc.text("Accommodation tariffs - entire stay", left, y);
    y += 4;
    doc.setFillColor(240, 244, 244);
    doc.rect(left, y, width, 12, "F");
    doc.setFontSize(8);
    let x = left;
    [
      "Room preference",
      "Rooms",
      "Beds each",
      "Tariff / room",
      "Room total",
    ].forEach((label, index) => {
      doc.text(doc.splitTextToSize(label, widths[index] - 4), x + 2, y + 5);
      x += widths[index];
    });
    y += 12;
  };
  if (y + 40 > bottom) nextPage();
  heading();
  for (const row of rows) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const values = [
      row.roomType.trim() || "Standard",
      String(row.quantity),
      String(row.bedsPerRoom),
      money(row.tariffPerRoom!),
      money((Math.round(row.tariffPerRoom! * 100) * row.quantity) / 100),
    ];
    const lines = values.map(
      (value, index) =>
        doc.splitTextToSize(value, widths[index] - 4) as string[],
    );
    const height = Math.max(
      9,
      Math.max(...lines.map((value) => value.length)) * 4 + 5,
    );
    if (y + height > bottom) {
      nextPage();
      heading();
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(18, 28, 43);
    let x = left;
    lines.forEach((value, index) => {
      doc.text(value, x + 2, y + 5);
      x += widths[index];
    });
    y += height;
    doc.setDrawColor(219, 225, 227);
    doc.setLineWidth(0.2);
    doc.line(left, y, left + width, y);
  }
  if (y + 15 > bottom) {
    nextPage();
    heading();
  }
  const total =
    rows.reduce(
      (sum, row) => sum + Math.round(row.tariffPerRoom! * 100) * row.quantity,
      0,
    ) / 100;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(18, 28, 43);
  doc.text("Estimated total", left + 2, y + 8);
  doc.text(money(total), left + width - 2, y + 8, { align: "right" });
  return y + 18;
}

export function appendAccommodationTariffs(
  doc: jsPDF,
  rows: TariffRow[],
  reference: string,
) {
  if (!hasAccommodationTariffs(rows)) return;
  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(18, 28, 43);
  doc.text(reference, 18, 20);
  drawAccommodationTariffs(doc, rows, 31, reference);
}
