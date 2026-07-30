import type { LineItemInput, Preset } from "./types";

export const defaultPreset: Preset = {
  business_name: "Quest Inn",
  tagline: "Beach Resort, Mandarmani",
  gstin: "19ANFPD5904J1ZZ",
  address_line1: "Mandarmani Marine Drive Road, Dadanpatra",
  address_line2: "Mandarmani, West Bengal 721455",
  phone: "+91 6296663434",
  fax: "",
  upi: "QUESTINNBEACHRESORT@icici",
  website: "www.questinn.in",
  email: "questinnbeachresort@gmail.com",
  bank_acc_name: "Quest Inn Beach Resort",
  invoice_prefix: "QBM",
  bank_name: "ICICI Bank, PRINCE ANWAR SHAH ROAD BRANCH",
  bank_account: "054005002409",
  bank_ifsc: "ICIC0000540",
  terms:
    "Thank you for choosing Quest Inn group of hotels. We hope you enjoyed your stay! For any inquiries please contact our front desk."
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

export const defaultLogoUrl = "/logo_questinn.png";
