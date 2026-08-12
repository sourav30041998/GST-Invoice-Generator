import { defaultPreset } from "../config/defaultPreset.js";
import type { ClientSession } from "mongoose";
import { BusinessProfileModel } from "../models/BusinessProfile.js";
import { OrganizationModel } from "../models/Organization.js";
import type { PresetPayload } from "../validation/invoiceSchemas.js";

type PresetShape = typeof defaultPreset;

type BusinessProfileShape = {
  _id?: unknown;
  organizationId?: unknown;
  profileKey?: string;
  businessName?: string;
  tagline?: string;
  gstin?: string;
  address?: { line1?: string; line2?: string };
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

function profileKey(organizationId: string) {
  return `organization-${organizationId}`;
}

function presetToProfile(
  organizationId: string,
  preset: PresetShape | PresetPayload,
  logoDataUrl = "",
) {
  return {
    organizationId,
    profileKey: profileKey(organizationId),
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
    organizationId: profile.organizationId
      ? String(profile.organizationId)
      : "",
    profileKey: profile.profileKey || "",
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

async function getOrCreateBusinessProfile(organizationId: string) {
  const profile = await BusinessProfileModel.findOneAndUpdate(
    { organizationId },
    {
      $setOnInsert: presetToProfile(organizationId, defaultPreset),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  if (!profile) {
    throw new Error("Could not initialize business profile");
  }

  return profile;
}

export async function createInitialBusinessProfile(
  organizationId: string,
  organizationName: string,
  ownerEmail: string,
  session?: ClientSession,
) {
  const preset = {
    ...defaultPreset,
    business_name: organizationName,
    email: ownerEmail,
    invoice_prefix: "INV",
  };
  await BusinessProfileModel.findOneAndUpdate(
    { organizationId },
    { $setOnInsert: presetToProfile(organizationId, preset) },
    { upsert: true, new: true, setDefaultsOnInsert: true, session },
  );
}

export async function getPreset(organizationId: string) {
  return profileToPreset(await getOrCreateBusinessProfile(organizationId));
}

export async function getLogoDataUrl(organizationId: string) {
  const profile = await getOrCreateBusinessProfile(organizationId);
  return profile.logoDataUrl || null;
}

export async function getSettings(organizationId: string) {
  const profile = await getOrCreateBusinessProfile(organizationId);
  return {
    preset: profileToPreset(profile),
    logoDataUrl: profile.logoDataUrl || null,
  };
}

export async function getBusinessProfileSnapshot(organizationId: string) {
  const profile = await getOrCreateBusinessProfile(organizationId);
  return {
    businessProfileId: profile._id,
    presetSnapshot: profileToPreset(profile),
    businessSnapshot: profileToBusinessSnapshot(profile),
  };
}

export async function savePreset(
  organizationId: string,
  preset: PresetPayload,
) {
  const current = await getOrCreateBusinessProfile(organizationId);
  const profile = await BusinessProfileModel.findOneAndUpdate(
    { organizationId },
    {
      $set: presetToProfile(organizationId, preset, current.logoDataUrl || ""),
    },
    { new: true, runValidators: true },
  ).lean();

  if (!profile) {
    throw new Error("Could not save business profile");
  }

  await OrganizationModel.updateOne(
    { _id: organizationId },
    {
      $set: {
        name: preset.business_name,
        onboardingComplete: true,
      },
    },
  );
  return profileToPreset(profile);
}

export async function saveLogo(organizationId: string, dataUrl: string) {
  await getOrCreateBusinessProfile(organizationId);
  await BusinessProfileModel.updateOne(
    { organizationId },
    { $set: { logoDataUrl: dataUrl } },
  );
  return dataUrl;
}

export async function removeLogo(organizationId: string) {
  await BusinessProfileModel.updateOne(
    { organizationId },
    { $set: { logoDataUrl: "" } },
  );
}
