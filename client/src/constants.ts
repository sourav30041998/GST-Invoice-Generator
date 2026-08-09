import type { LineItemInput, Preset } from "./types";

export const defaultPreset: Preset = {
  business_name: "Sample Stay Hotel",
  tagline: "Demo Property, Kolkata",
  gstin: "22AAAAA0000A1Z5",
  address_line1: "123 Example Road",
  address_line2: "Kolkata, West Bengal 700001",
  phone: "+91 90000 00000",
  fax: "",
  upi: "samplestay@upi",
  website: "www.samplestay.test",
  email: "billing@samplestay.test",
  bank_acc_name: "Sample Stay Hotel",
  invoice_prefix: "TST",
  bank_name: "Example Bank, Kolkata Branch",
  bank_account: "123456789012",
  bank_ifsc: "TEST0001234",
  terms:
    "This is a sample preset for testing. Replace these details with your business information before issuing an invoice."
};

export const taxPresets = [
  {
    key: "Rooms <= Rs.7500/day",
    label: "Rooms - 12%",
    hsn: "996311",
    cgstRate: 6,
    sgstRate: 6,
    igstRate: 0,
    allowInclusive: false,
    note: "Hotel accommodation up to Rs. 7,500 per unit per day"
  },
  {
    key: "Rooms > Rs.7500/day",
    label: "Rooms - 18%",
    hsn: "996311",
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 0,
    allowInclusive: false,
    note: "Hotel accommodation above Rs. 7,500 per unit per day"
  },
  {
    key: "Food Bill",
    label: "Food - 5%",
    hsn: "996331",
    cgstRate: 2.5,
    sgstRate: 2.5,
    igstRate: 0,
    allowInclusive: true,
    note: "Restaurant service other than specified premises"
  },
  {
    key: "Outdoor Catering - 5%",
    label: "Catering - 5%",
    hsn: "996334",
    cgstRate: 2.5,
    sgstRate: 2.5,
    igstRate: 0,
    allowInclusive: true,
    note: "Outdoor catering at premises other than specified premises"
  },
  {
    key: "Specified Premises Catering - 18%",
    label: "Catering - 18%",
    hsn: "996334",
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 0,
    allowInclusive: false,
    note: "Specified premises or higher hotel accommodation premises"
  },
  {
    key: "Custom",
    label: "Custom",
    hsn: "",
    cgstRate: 0,
    sgstRate: 0,
    igstRate: 0,
    allowInclusive: true,
    note: "Manual rates"
  }
];

export const emptyLineItem = (presetKey = "Rooms <= Rs.7500/day", date = ""): LineItemInput => {
  const preset = taxPresets.find((item) => item.key === presetKey) || taxPresets[0];
  return {
    id: crypto.randomUUID(),
    presetKey: preset.key,
    description: "",
    hsn: preset.hsn,
    date,
    units: 1,
    rate: "",
    cgstRate: preset.cgstRate,
    sgstRate: preset.sgstRate,
    igstRate: preset.igstRate,
    taxInclusive: false
  };
};
