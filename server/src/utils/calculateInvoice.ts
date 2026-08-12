export type RawLineItem = {
  presetKey?: string;
  description?: string;
  hsn?: string;
  date?: string;
  units: number;
  rate: number;
  cgstRate?: number;
  sgstRate?: number;
  igstRate?: number;
  taxInclusive?: boolean;
};

export type RawAdjustment = {
  desc?: string;
  amount: number;
  type?: "add" | "deduct";
};

const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateLineItem(item: RawLineItem) {
  const units = Number(item.units) || 0;
  const rate = Number(item.rate) || 0;
  const cgstRate = Number(item.cgstRate) || 0;
  const sgstRate = Number(item.sgstRate) || 0;
  const igstRate = Number(item.igstRate) || 0;
  const taxRate = (cgstRate + sgstRate + igstRate) / 100;
  const gross = units * rate;
  const taxable =
    item.taxInclusive && taxRate > 0 ? gross / (1 + taxRate) : gross;
  const cgstAmount = taxable * (cgstRate / 100);
  const sgstAmount = taxable * (sgstRate / 100);
  const igstAmount = taxable * (igstRate / 100);
  const taxTotal = cgstAmount + sgstAmount + igstAmount;

  return {
    presetKey: item.presetKey || "Custom",
    description: item.description || "",
    hsn: item.hsn || "",
    date: item.date || "",
    units: round2(units),
    rate: round2(rate),
    cgstRate: round2(cgstRate),
    sgstRate: round2(sgstRate),
    igstRate: round2(igstRate),
    taxInclusive: Boolean(item.taxInclusive),
    taxable: round2(taxable),
    cgstAmount: round2(cgstAmount),
    sgstAmount: round2(sgstAmount),
    igstAmount: round2(igstAmount),
    taxTotal: round2(taxTotal),
    total: round2(taxable + taxTotal),
  };
}

export function calculateInvoiceTotals(
  lineItems: RawLineItem[],
  adjustments: RawAdjustment[] = [],
) {
  const calculatedItems = lineItems.map(calculateLineItem);
  const calculatedAdjustments = adjustments.map((adjustment) => ({
    desc: adjustment.desc || "",
    amount: round2(Number(adjustment.amount) || 0),
    type: adjustment.type === "deduct" ? "deduct" : "add",
  }));

  const totalTaxable = round2(
    calculatedItems.reduce((sum, item) => sum + item.taxable, 0),
  );
  const totalCGST = round2(
    calculatedItems.reduce((sum, item) => sum + item.cgstAmount, 0),
  );
  const totalSGST = round2(
    calculatedItems.reduce((sum, item) => sum + item.sgstAmount, 0),
  );
  const totalIGST = round2(
    calculatedItems.reduce((sum, item) => sum + item.igstAmount, 0),
  );
  const grandTotal = round2(
    calculatedItems.reduce((sum, item) => sum + item.total, 0),
  );
  const addTotal = round2(
    calculatedAdjustments
      .filter((adj) => adj.type === "add")
      .reduce((sum, adj) => sum + adj.amount, 0),
  );
  const deductTotal = round2(
    calculatedAdjustments
      .filter((adj) => adj.type === "deduct")
      .reduce((sum, adj) => sum + adj.amount, 0),
  );
  const netTotal = round2(grandTotal + addTotal - deductTotal);

  return {
    lineItems: calculatedItems,
    adjustments: calculatedAdjustments,
    totalTaxable,
    totalCGST,
    totalSGST,
    totalIGST,
    grandTotal,
    addTotal,
    deductTotal,
    netTotal,
  };
}
