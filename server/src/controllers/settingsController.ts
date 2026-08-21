import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { getAuthContext } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { clearCompanyData } from "../services/invoiceService.js";
import {
  getSettings,
  removeLogo,
  saveLogo,
  savePreset,
  saveTaxPresets,
} from "../services/settingsService.js";
import { logoSchema, presetSchema } from "../validation/invoiceSchemas.js";
import { taxPresetPreferencesPayloadSchema } from "../validation/settingsSchemas.js";

export const readSettings: RequestHandler = async (_req, res, next) => {
  try {
    const tenant = getAuthContext(res);
    res.json(await getSettings(tenant.organizationId));
  } catch (error) {
    next(error);
  }
};

export const updatePreset: RequestHandler = async (req, res, next) => {
  try {
    const preset = presetSchema.parse(req.body);
    const tenant = getAuthContext(res);
    res.json({ preset: await savePreset(tenant.organizationId, preset) });
  } catch (error) {
    next(error);
  }
};

export const updateTaxPresets: RequestHandler = async (req, res, next) => {
  try {
    const { taxPresets } = taxPresetPreferencesPayloadSchema.parse(req.body);
    const tenant = getAuthContext(res);
    res.json({
      taxPresets: await saveTaxPresets(tenant.organizationId, taxPresets),
    });
  } catch (error) {
    next(error);
  }
};

export const updateLogo: RequestHandler = async (req, res, next) => {
  try {
    const { dataUrl } = logoSchema.parse(req.body);
    const tenant = getAuthContext(res);
    await saveLogo(tenant.organizationId, dataUrl);
    res.json({ logoDataUrl: dataUrl });
  } catch (error) {
    next(error);
  }
};

export const deleteLogo: RequestHandler = async (_req, res, next) => {
  try {
    const tenant = getAuthContext(res);
    await removeLogo(tenant.organizationId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const clearAllData: RequestHandler = async (_req, res, next) => {
  try {
    if (!env.ALLOW_DATABASE_RESET) {
      throw new ApiError(403, "Database reset is disabled in this environment");
    }

    const context = getAuthContext(res);
    await clearCompanyData({
      organizationId: context.organizationId,
      userId: context.userId,
      userEmail: context.email,
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
