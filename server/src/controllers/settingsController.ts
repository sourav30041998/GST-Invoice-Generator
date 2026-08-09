import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { ApiError } from "../middleware/errorHandler.js";
import { clearDatabase } from "../services/invoiceService.js";
import { getSettings, removeLogo, saveLogo, savePreset } from "../services/settingsService.js";
import { logoSchema, presetSchema } from "../validation/invoiceSchemas.js";

export const readSettings: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await getSettings());
  } catch (error) {
    next(error);
  }
};

export const updatePreset: RequestHandler = async (req, res, next) => {
  try {
    const preset = presetSchema.parse(req.body);
    res.json({ preset: await savePreset(preset) });
  } catch (error) {
    next(error);
  }
};

export const updateLogo: RequestHandler = async (req, res, next) => {
  try {
    const { dataUrl } = logoSchema.parse(req.body);
    await saveLogo(dataUrl);
    res.json({ logoDataUrl: dataUrl });
  } catch (error) {
    next(error);
  }
};

export const deleteLogo: RequestHandler = async (_req, res, next) => {
  try {
    await removeLogo();
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

    await clearDatabase();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};