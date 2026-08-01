import { Router } from "express";
import { listIndianStateRecords } from "../controllers/referenceDataController.js";

const router = Router();

router.get("/indian-states", listIndianStateRecords);

export default router;
