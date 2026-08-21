import type { AdjustmentInput, InvoicePayload, LineItemInput } from "../types";
import { calculateInvoiceTotals, MAX_INVOICE_AMOUNT } from "./calculations";

export type InvoiceValidationIssue = {
  tab: "details" | "items";
  message: string;
};

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function asFiniteNumber(value: number | string) {
  if (typeof value === "string" && !value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasPrecision(value: number, decimalPlaces: number) {
  const factor = 10 ** decimalPlaces;
  return Math.abs(value - Math.round(value * factor) / factor) < 1e-8;
}

function validateLineItem(
  line: LineItemInput,
  index: number,
): InvoiceValidationIssue | null {
  const label = `Charge or service ${index + 1}`;
  if (line.hsn && !/^\d{4}(?:\d{2})?$/.test(line.hsn.trim())) {
    return {
      tab: "items",
      message: `${label}: HSN/SAC must contain 4 or 6 digits.`,
    };
  }

  if (line.date && !isCalendarDate(line.date)) {
    return { tab: "items", message: `${label}: service date is invalid.` };
  }

  const units = asFiniteNumber(line.units);
  const rate = asFiniteNumber(line.rate);
  if (
    units === null ||
    units < 0.001 ||
    units > 999 ||
    !hasPrecision(units, 3)
  ) {
    return {
      tab: "items",
      message: `${label}: quantity must be from 0.001 to 999 with up to 3 decimal places.`,
    };
  }
  if (
    rate === null ||
    rate < 0.01 ||
    rate > MAX_INVOICE_AMOUNT ||
    !hasPrecision(rate, 2)
  ) {
    return {
      tab: "items",
      message: `${label}: rate must be from 0.01 to 9,999,999,999 with up to 2 decimal places.`,
    };
  }

  const cgst = asFiniteNumber(line.cgstRate);
  const sgst = asFiniteNumber(line.sgstRate);
  const igst = asFiniteNumber(line.igstRate);
  if (
    cgst === null ||
    sgst === null ||
    igst === null ||
    cgst < 0 ||
    sgst < 0 ||
    igst < 0 ||
    cgst > 100 ||
    sgst > 100 ||
    igst > 100 ||
    !hasPrecision(cgst, 2) ||
    !hasPrecision(sgst, 2) ||
    !hasPrecision(igst, 2)
  ) {
    return {
      tab: "items",
      message: `${label}: GST rates must be between 0 and 100 with up to 2 decimal places.`,
    };
  }
  if (igst > 0 && (cgst > 0 || sgst > 0)) {
    return {
      tab: "items",
      message: `${label}: use either IGST or CGST and SGST, not both.`,
    };
  }
  if (cgst > 0 !== sgst > 0 || (cgst > 0 && cgst !== sgst)) {
    return {
      tab: "items",
      message: `${label}: CGST and SGST must be equal and applied together.`,
    };
  }
  if (cgst + sgst + igst > 100) {
    return {
      tab: "items",
      message: `${label}: combined GST rate cannot exceed 100%.`,
    };
  }

  return null;
}

export function validateInvoiceForm(
  form: Pick<
    InvoicePayload,
    "invDate" | "checkinDate" | "checkoutDate" | "partyGSTIN"
  >,
  lineItems: LineItemInput[],
  adjustments: AdjustmentInput[],
): InvoiceValidationIssue | null {
  if (!isCalendarDate(form.invDate)) {
    return { tab: "details", message: "Invoice date is invalid." };
  }
  if (!isCalendarDate(form.checkinDate) || !isCalendarDate(form.checkoutDate)) {
    return {
      tab: "details",
      message: "Arrival and departure must be valid dates.",
    };
  }
  if (form.checkoutDate < form.checkinDate) {
    return {
      tab: "details",
      message: "Departure cannot be earlier than arrival.",
    };
  }
  if (
    form.partyGSTIN.trim() &&
    !/^(?:0[1-9]|[12]\d|3[0-7])[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(
      form.partyGSTIN.trim(),
    )
  ) {
    return {
      tab: "details",
      message: "GSTIN must be a valid 15-character Indian GSTIN.",
    };
  }
  if (!lineItems.length) {
    return { tab: "items", message: "Add at least one charge or service." };
  }

  for (const [index, line] of lineItems.entries()) {
    const issue = validateLineItem(line, index);
    if (issue) {
      return issue;
    }
  }

  for (const [index, adjustment] of adjustments.entries()) {
    const isUsed =
      adjustment.desc.trim() || String(adjustment.amount ?? "").trim();
    if (!isUsed) {
      continue;
    }
    const amount = asFiniteNumber(adjustment.amount);
    if (!adjustment.desc.trim()) {
      return {
        tab: "items",
        message: `Adjustment ${index + 1}: description is required.`,
      };
    }
    if (
      amount === null ||
      amount < 0.01 ||
      amount > MAX_INVOICE_AMOUNT ||
      !hasPrecision(amount, 2)
    ) {
      return {
        tab: "items",
        message: `Adjustment ${index + 1}: amount must be from 0.01 to 9,999,999,999 with up to 2 decimal places.`,
      };
    }
  }

  const totals = calculateInvoiceTotals(
    lineItems,
    adjustments.filter(
      (adjustment) =>
        adjustment.desc.trim() || String(adjustment.amount ?? "").trim(),
    ),
  );
  if (totals.netTotal <= 0) {
    return {
      tab: "items",
      message:
        "Deductions cannot reduce the invoice payable amount to zero or below.",
    };
  }
  return null;
}
