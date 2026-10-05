import { MAX_INVOICE_AMOUNT } from "./calculateInvoice.js";

export type AccommodationTariff = { quantity: number; tariffPerRoom?: number };

// Integer paise keep the agreed stay tariff exact. Undefined identifies a legacy plan.
export function accommodationTotalMinor(
  rows: AccommodationTariff[],
): number | undefined {
  if (!rows.some((row) => row.tariffPerRoom !== undefined)) return undefined;
  let total = 0;
  for (const row of rows) {
    const rate = row.tariffPerRoom;
    if (
      rate === undefined ||
      !Number.isFinite(rate) ||
      rate < 0 ||
      rate > MAX_INVOICE_AMOUNT ||
      !Number.isInteger(row.quantity) ||
      row.quantity < 1 ||
      row.quantity > 20 ||
      rate !== Math.round(rate * 100) / 100
    ) {
      throw new Error(
        "Enter a valid tariff with up to two decimal places for every room combination",
      );
    }
    total += Math.round(rate * 100) * row.quantity;
    if (!Number.isSafeInteger(total) || total > MAX_INVOICE_AMOUNT * 100) {
      throw new Error("Accommodation total exceeds the supported limit");
    }
  }
  return total;
}
