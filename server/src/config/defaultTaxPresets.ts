export type TaxPreset = {
  key: string;
  label: string;
  hsn: string;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  allowInclusive: boolean;
  note: string;
};

export const defaultTaxPresets: TaxPreset[] = [
  {
    key: "Rooms <= Rs.7500/day",
    label: "Rooms - 12%",
    hsn: "996311",
    cgstRate: 6,
    sgstRate: 6,
    igstRate: 0,
    allowInclusive: false,
    note: "Hotel accommodation up to Rs. 7,500 per unit per day",
  },
  {
    key: "Rooms > Rs.7500/day",
    label: "Rooms - 18%",
    hsn: "996311",
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 0,
    allowInclusive: false,
    note: "Hotel accommodation above Rs. 7,500 per unit per day",
  },
  {
    key: "Food Bill",
    label: "Food - 5%",
    hsn: "996331",
    cgstRate: 2.5,
    sgstRate: 2.5,
    igstRate: 0,
    allowInclusive: true,
    note: "Restaurant service other than specified premises",
  },
  {
    key: "Outdoor Catering - 5%",
    label: "Catering - 5%",
    hsn: "996334",
    cgstRate: 2.5,
    sgstRate: 2.5,
    igstRate: 0,
    allowInclusive: true,
    note: "Outdoor catering at premises other than specified premises",
  },
  {
    key: "Specified Premises Catering - 18%",
    label: "Catering - 18%",
    hsn: "996334",
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 0,
    allowInclusive: false,
    note: "Specified premises or higher hotel accommodation premises",
  },
];

export function freshDefaultTaxPresets() {
  return defaultTaxPresets.map((preset) => ({ ...preset }));
}
