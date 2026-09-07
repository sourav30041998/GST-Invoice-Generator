import { Router } from "express";
import {
  createCustomerRecord,
  deactivateCustomerRecord,
  getCustomerRecord,
  listCustomerRecords,
  lookupCustomerRecord,
  updateCustomerRecord,
} from "../controllers/customerController.js";

const router = Router();

router.post("/lookup", lookupCustomerRecord);
router.post("/search", listCustomerRecords);
router.post("/", createCustomerRecord);
router.get("/:customerId", getCustomerRecord);
router.patch("/:customerId", updateCustomerRecord);
router.delete("/:customerId", deactivateCustomerRecord);

export default router;
