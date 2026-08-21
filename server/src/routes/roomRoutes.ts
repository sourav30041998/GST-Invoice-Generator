import { Router } from "express";
import {
  archiveRoomRecord,
  createRoomRecord,
  getRoomBookingBoardRecords,
  listAvailableRoomRecords,
  listRoomAllocationRecords,
  listRoomRecords,
  updateRoomRecord,
} from "../controllers/roomController.js";

const router = Router();

router.get("/availability", listAvailableRoomRecords);
router.get("/booking-board", getRoomBookingBoardRecords);
router.get("/", listRoomRecords);
router.post("/", createRoomRecord);
router.get("/:roomId/allocations", listRoomAllocationRecords);
router.patch("/:roomId", updateRoomRecord);
router.delete("/:roomId", archiveRoomRecord);

export default router;
