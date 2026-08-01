import { defaultPreset } from "../config/defaultPreset.js";
<<<<<<< HEAD
import { SettingModel } from "../models/Setting.js";
import type { PresetPayload } from "../validation/invoiceSchemas.js";

export async function getPreset() {
  const row = await SettingModel.findOne({ key: "preset" }).lean();
  return { ...defaultPreset, ...(row?.value as Partial<typeof defaultPreset> | undefined) };
}

export async function getLogoDataUrl() {
  const row = await SettingModel.findOne({ key: "logo" }).lean();
  return typeof row?.value === "string" ? row.value : null;
}

export async function getSettings() {
  const [preset, logoDataUrl] = await Promise.all([getPreset(), getLogoDataUrl()]);
  return { preset, logoDataUrl };
}

export async function savePreset(preset: PresetPayload) {
  const value = { ...defaultPreset, ...preset };
  await SettingModel.findOneAndUpdate({ key: "preset" }, { key: "preset", value }, { upsert: true });
  return value;
}

export async function saveLogo(dataUrl: string) {
  await SettingModel.findOneAndUpdate({ key: "logo" }, { key: "logo", value: dataUrl }, { upsert: true });
=======
import { BusinessProfileModel } from "../models/BusinessProfile.js";
import { SettingModel } from "../models/Setting.js";
import type { PresetPayload } from "../validation/invoiceSchemas.js";

const DEFAULT_PROFILE_KEY = "default";

type PresetShape = typeof defaultPreset;

type BusinessProfileShape = {
  _id?: unknown;
  profileKey?: string;
  businessName?: string;
  tagline?: string;
  gstin?: string;
  address?: {
    line1?: string;
    line2?: string;
  };
  contact?: {
    phone?: string;
    fax?: string;
    upi?: string;
    website?: string;
    email?: string;
  };
  invoicePrefix?: string;
  bankDetails?: {
    accountName?: string;
    bankName?: string;
    accountNumber?: string;
    ifsc?: string;
  };
  terms?: string;
  logoDataUrl?: string;
  isActive?: boolean;
};

function presetToProfile(
  preset: PresetShape | PresetPayload,
  logoDataUrl = "",
) {
  return {
    profileKey: DEFAULT_PROFILE_KEY,
    businessName: preset.business_name,
    tagline: preset.tagline || "",
    gstin: preset.gstin || "",
    address: {
      line1: preset.address_line1 || "",
      line2: preset.address_line2 || "",
    },
    contact: {
      phone: preset.phone || "",
      fax: preset.fax || "",
      upi: preset.upi || "",
      website: preset.website || "",
      email: preset.email || "",
    },
    invoicePrefix: preset.invoice_prefix || "INV",
    bankDetails: {
      accountName: preset.bank_acc_name || "",
      bankName: preset.bank_name || "",
      accountNumber: preset.bank_account || "",
      ifsc: preset.bank_ifsc || "",
    },
    terms: preset.terms || "",
    logoDataUrl,
    isActive: true,
  };
}

function profileToPreset(profile: BusinessProfileShape): PresetShape {
  return {
    ...defaultPreset,
    business_name: profile.businessName || defaultPreset.business_name,
    tagline: profile.tagline || "",
    gstin: profile.gstin || "",
    address_line1: profile.address?.line1 || "",
    address_line2: profile.address?.line2 || "",
    phone: profile.contact?.phone || "",
    fax: profile.contact?.fax || "",
    upi: profile.contact?.upi || "",
    website: profile.contact?.website || "",
    email: profile.contact?.email || "",
    bank_acc_name: profile.bankDetails?.accountName || "",
    invoice_prefix: profile.invoicePrefix || defaultPreset.invoice_prefix,
    bank_name: profile.bankDetails?.bankName || "",
    bank_account: profile.bankDetails?.accountNumber || "",
    bank_ifsc: profile.bankDetails?.ifsc || "",
    terms: profile.terms || "",
  };
}

function profileToBusinessSnapshot(profile: BusinessProfileShape) {
  const preset = profileToPreset(profile);
  return {
    profileId: profile._id ? String(profile._id) : "",
    profileKey: profile.profileKey || DEFAULT_PROFILE_KEY,
    businessName: preset.business_name,
    tagline: preset.tagline || "",
    gstin: preset.gstin || "",
    address: {
      line1: preset.address_line1 || "",
      line2: preset.address_line2 || "",
    },
    contact: {
      phone: preset.phone || "",
      fax: preset.fax || "",
      upi: preset.upi || "",
      website: preset.website || "",
      email: preset.email || "",
    },
    invoicePrefix: preset.invoice_prefix,
    bankDetails: {
      accountName: preset.bank_acc_name || "",
      bankName: preset.bank_name || "",
      accountNumber: preset.bank_account || "",
      ifsc: preset.bank_ifsc || "",
    },
    terms: preset.terms || "",
  };
}

async function getLegacySettings() {
  const [presetRow, logoRow] = await Promise.all([
    SettingModel.findOne({ key: "preset" }).lean(),
    SettingModel.findOne({ key: "logo" }).lean(),
  ]);

  return {
    preset: {
      ...defaultPreset,
      ...(presetRow?.value as Partial<PresetShape> | undefined),
    },
    logoDataUrl: typeof logoRow?.value === "string" ? logoRow.value : "",
  };
}

async function getOrCreateActiveBusinessProfile() {
  const existing = await BusinessProfileModel.findOne({
    profileKey: DEFAULT_PROFILE_KEY,
  }).lean();
  if (existing) {
    return existing;
  }

  const legacy = await getLegacySettings();
  const created = await BusinessProfileModel.findOneAndUpdate(
    { profileKey: DEFAULT_PROFILE_KEY },
    { $setOnInsert: presetToProfile(legacy.preset, legacy.logoDataUrl) },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  if (!created) {
    throw new Error("Could not initialize business profile");
  }

  return created;
}

export async function getPreset() {
  return profileToPreset(await getOrCreateActiveBusinessProfile());
}

export async function getLogoDataUrl() {
  const profile = await getOrCreateActiveBusinessProfile();
  return profile.logoDataUrl || null;
}

export async function getSettings() {
  const profile = await getOrCreateActiveBusinessProfile();
  return {
    preset: profileToPreset(profile),
    logoDataUrl: profile.logoDataUrl || null,
  };
}

export async function getBusinessProfileSnapshot() {
  const profile = await getOrCreateActiveBusinessProfile();
  return {
    businessProfileId: profile._id,
    presetSnapshot: profileToPreset(profile),
    businessSnapshot: profileToBusinessSnapshot(profile),
  };
}

export async function savePreset(preset: PresetPayload) {
  const current = await getOrCreateActiveBusinessProfile();
  const profile = await BusinessProfileModel.findOneAndUpdate(
    { profileKey: DEFAULT_PROFILE_KEY },
    { $set: presetToProfile(preset, current.logoDataUrl || "") },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  if (!profile) {
    throw new Error("Could not save business profile");
  }

  return profileToPreset(profile);
}

export async function saveLogo(dataUrl: string) {
  await getOrCreateActiveBusinessProfile();
  await BusinessProfileModel.findOneAndUpdate(
    { profileKey: DEFAULT_PROFILE_KEY },
    { $set: { logoDataUrl: dataUrl } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
>>>>>>> codex/backend-api-data
  return dataUrl;
}

export async function removeLogo() {
<<<<<<< HEAD
=======
  await BusinessProfileModel.findOneAndUpdate(
    { profileKey: DEFAULT_PROFILE_KEY },
    { $set: { logoDataUrl: "" } },
  );
>>>>>>> codex/backend-api-data
  await SettingModel.deleteOne({ key: "logo" });
}
