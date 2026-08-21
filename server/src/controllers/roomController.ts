import type { RequestHandler, Response } from "express";
import { getAuthContext } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import {
  archiveRoom,
  createRoom,
  getRoomBookingBoard,
  getRoomAllocations,
  listAvailableRooms,
  listRooms,
  updateRoom,
} from "../services/roomService.js";
import type { TenantContext } from "../services/invoiceService.js";
import {
  createRoomSchema,
  roomAllocationHistoryQuerySchema,
  roomAvailabilityQuerySchema,
  roomBookingBoardQuerySchema,
  roomIdSchema,
  roomListQuerySchema,
  updateRoomSchema,
} from "../validation/roomSchemas.js";

function tenantContext(res: Response): TenantContext {
  const context = getAuthContext(res);
  if (context.role !== "owner") {
    throw new ApiError(403, "Organization owner permission is required");
  }
  return {
    organizationId: context.organizationId,
    userId: context.userId,
    userEmail: context.email,
  };
}

export const listRoomRecords: RequestHandler = async (req, res, next) => {
  try {
    res.json(
      await listRooms(tenantContext(res), roomListQuerySchema.parse(req.query)),
    );
  } catch (error) {
    next(error);
  }
};

export const listAvailableRoomRecords: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    res.json(
      await listAvailableRooms(
        tenantContext(res),
        roomAvailabilityQuerySchema.parse(req.query),
      ),
    );
  } catch (error) {
    next(error);
  }
};

export const getRoomBookingBoardRecords: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    res.json(
      await getRoomBookingBoard(
        tenantContext(res),
        roomBookingBoardQuerySchema.parse(req.query),
      ),
    );
  } catch (error) {
    next(error);
  }
};

export const createRoomRecord: RequestHandler = async (req, res, next) => {
  try {
    res
      .status(201)
      .json(
        await createRoom(tenantContext(res), createRoomSchema.parse(req.body)),
      );
  } catch (error) {
    next(error);
  }
};

export const updateRoomRecord: RequestHandler = async (req, res, next) => {
  try {
    const roomId = roomIdSchema.parse(req.params.roomId);
    res.json(
      await updateRoom(
        tenantContext(res),
        roomId,
        updateRoomSchema.parse(req.body),
      ),
    );
  } catch (error) {
    next(error);
  }
};

export const archiveRoomRecord: RequestHandler = async (req, res, next) => {
  try {
    const roomId = roomIdSchema.parse(req.params.roomId);
    await archiveRoom(tenantContext(res), roomId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const listRoomAllocationRecords: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const roomId = roomIdSchema.parse(req.params.roomId);
    res.json(
      await getRoomAllocations(
        tenantContext(res),
        roomId,
        roomAllocationHistoryQuerySchema.parse(req.query),
      ),
    );
  } catch (error) {
    next(error);
  }
};
