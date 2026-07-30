import { defaultPreset } from "../config/defaultPreset.js";
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
  return dataUrl;
}

export async function removeLogo() {
  await SettingModel.deleteOne({ key: "logo" });
}
