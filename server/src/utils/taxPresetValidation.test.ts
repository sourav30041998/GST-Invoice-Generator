import assert from "node:assert/strict";
import test from "node:test";
import { freshDefaultTaxPresets } from "../config/defaultTaxPresets.js";
import { taxPresetPreferencesSchema } from "../validation/settingsSchemas.js";

test("default GST presets satisfy the settings contract", () => {
  const presets = freshDefaultTaxPresets();
  const result = taxPresetPreferencesSchema.safeParse(presets);
  assert.equal(result.success, true);
  assert.equal(
    presets.some((preset) => preset.key.toLowerCase() === "custom"),
    false,
  );
});

test("Custom cannot be persisted as a company GST preset", () => {
  const presets = [
    ...freshDefaultTaxPresets(),
    {
      key: "Custom",
      label: "Custom",
      hsn: "",
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 0,
      allowInclusive: true,
      note: "Manual invoice values",
    },
  ];

  const result = taxPresetPreferencesSchema.safeParse(presets);
  assert.equal(result.success, false);
});

test("GST preset keys are unique", () => {
  const presets = freshDefaultTaxPresets();
  presets[1] = { ...presets[1], key: presets[0].key };

  const result = taxPresetPreferencesSchema.safeParse(presets);
  assert.equal(result.success, false);
});

test("CGST and SGST must remain equal", () => {
  const presets = freshDefaultTaxPresets();
  presets[0] = { ...presets[0], sgstRate: 5 };

  const result = taxPresetPreferencesSchema.safeParse(presets);
  assert.equal(result.success, false);
});

test("a preset cannot combine IGST with CGST and SGST", () => {
  const presets = freshDefaultTaxPresets();
  presets[0] = { ...presets[0], igstRate: 12 };

  const result = taxPresetPreferencesSchema.safeParse(presets);
  assert.equal(result.success, false);
});
