import type { Adjustment, AdjustmentInput, CalculatedLineItem, LineItemInput } from "../types";

export type InvoiceTotals = {
  lineItems: CalculatedLineItem[];
  adjustments: Adjustment[];
  totalTaxable: number;
  totalCGST: number;
  totalSGST: number;
  totalIGST: number;
  grandTotal: number;
  addTotal: number;
  deductTotal: number;
  netTotal: number;
};

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const toNumber = (value: number | string | undefined) => Number(value) || 0;

export function calculateLineItem(item: LineItemInput): CalculatedLineItem {
  const units = toNumber(item.units);
  const rate = toNumber(item.rate);
  const totalTaxRate = (item.cgstRate + item.sgstRate + item.igstRate) / 100;
  const gross = units * rate;
  const taxable = item.taxInclusive && totalTaxRate > 0 ? gross / (1 + totalTaxRate) : gross;
  const cgstAmount = taxable * (item.cgstRate / 100);
  const sgstAmount = taxable * (item.sgstRate / 100);
  const igstAmount = taxable * (item.igstRate / 100);
  const taxTotal = cgstAmount + sgstAmount + igstAmount;

  return {
    presetKey: item.presetKey,
    description: item.description,
    hsn: item.hsn,
    date: item.date,
    units: round2(units),
    rate: round2(rate),
    cgstRate: round2(item.cgstRate),
    sgstRate: round2(item.sgstRate),
    igstRate: round2(item.igstRate),
    taxInclusive: item.taxInclusive,
    taxable: round2(taxable),
    cgstAmount: round2(cgstAmount),
    sgstAmount: round2(sgstAmount),
    igstAmount: round2(igstAmount),
    taxTotal: round2(taxTotal),
    total: round2(taxable + taxTotal)
  };
}

export function calculateInvoiceTotals(items: LineItemInput[], adjustments: AdjustmentInput[]): InvoiceTotals {
  const lineItems = items.map(calculateLineItem);
  const calculatedAdjustments = adjustments.map((adjustment) => ({
    desc: adjustment.desc,
    amount: round2(toNumber(adjustment.amount)),
    type: adjustment.type
  }));
  const totalTaxable = round2(lineItems.reduce((sum, item) => sum + item.taxable, 0));
  const totalCGST = round2(lineItems.reduce((sum, item) => sum + item.cgstAmount, 0));
  const totalSGST = round2(lineItems.reduce((sum, item) => sum + item.sgstAmount, 0));
  const totalIGST = round2(lineItems.reduce((sum, item) => sum + item.igstAmount, 0));
  const grandTotal = round2(lineItems.reduce((sum, item) => sum + item.total, 0));
  const addTotal = round2(
    calculatedAdjustments.filter((adjustment) => adjustment.type === "add").reduce((sum, item) => sum + item.amount, 0)
  );
  const deductTotal = round2(
    calculatedAdjustments
      .filter((adjustment) => adjustment.type === "deduct")
      .reduce((sum, item) => sum + item.amount, 0)
  );

  return {
    lineItems,
    adjustments: calculatedAdjustments,
    totalTaxable,
    totalCGST,
    totalSGST,
    totalIGST,
    grandTotal,
    addTotal,
    deductTotal,
    netTotal: round2(grandTotal + addTotal - deductTotal)
  };
}

export function formatCurrency(value: number | string | undefined) {
  return `Rs. ${toNumber(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function numWords(value: number) {
  const n = Math.floor(Math.abs(value));
  if (n === 0) {
    return "Zero";
  }

  const ones = [
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
    "Nineteen"
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const underHundred = (num: number): string =>
    num < 20 ? ones[num] : `${tens[Math.floor(num / 10)]}${num % 10 ? ` ${ones[num % 10]}` : ""}`;

  const underThousand = (num: number): string => {
    if (num < 100) {
      return underHundred(num);
    }
    return `${ones[Math.floor(num / 100)]} Hundred${num % 100 ? ` ${underHundred(num % 100)}` : ""}`;
  };

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  return [
    crore ? `${underThousand(crore)} Crore` : "",
    lakh ? `${underThousand(lakh)} Lakh` : "",
    thousand ? `${underThousand(thousand)} Thousand` : "",
    rest ? underThousand(rest) : ""
  ]
    .filter(Boolean)
    .join(" ");
}
