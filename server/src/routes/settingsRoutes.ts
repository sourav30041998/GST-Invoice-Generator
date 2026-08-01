import { Router } from "express";
import { clearAllData, deleteLogo, readSettings, updateLogo, updatePreset } from "../controllers/settingsController.js";

const router = Router();

router.get("/", readSettings);
router.put("/preset", updatePreset);
router.put("/logo", updateLogo);
router.delete("/logo", deleteLogo);
router.delete("/database", clearAllData);

export default router;
