import type { RequestHandler } from "express";
import { listIndianStates } from "../services/referenceDataService.js";

export const listIndianStateRecords: RequestHandler = async (
  _req,
  res,
  next,
) => {
  try {
    res.json(await listIndianStates());
  } catch (error) {
    next(error);
  }
};
