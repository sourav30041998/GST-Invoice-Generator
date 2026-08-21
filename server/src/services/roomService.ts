import type { ClientSession } from "mongoose";
import { Types } from "mongoose";
import { ApiError } from "../middleware/errorHandler.js";
import { AuditLogModel } from "../models/AuditLog.js";
import { RoomAllocationModel } from "../models/RoomAllocation.js";
import { RoomModel } from "../models/Room.js";
import {
  isValidStayRange,
  normalizeRoomNumber,
  ROOM_ALLOCATION_LOCK_STATUSES,
} from "../utils/roomRules.js";
import type {
  CreateRoomPayload,
  RoomAllocationHistoryQuery,
  RoomAvailabilityQuery,
  RoomBookingBoardQuery,
  RoomListQuery,
  UpdateRoomPayload,
} from "../validation/roomSchemas.js";
import type { TenantContext } from "./invoiceService.js";

const MAX_ROOMS_PER_ORGANIZATION = 10_000;
const ROOM_HISTORY_PAGE_SIZE = 10;

export type RoomSnapshot = {
  roomId: string;
  roomNumber: string;
  roomType: string;
};

type AllocationWorkflowStatus =
  "reserved" | "checkedIn" | "checkedOut" | "cancelled";

function queryWithSession<T extends { session: (session: ClientSession) => T }>(
  query: T,
  session?: ClientSession,
) {
  return session ? query.session(session) : query;
}

async function writeRoomAudit(
  tenant: TenantContext,
  entityType: "room" | "room_allocation",
  entityId: unknown,
  action: string,
  before: unknown,
  after: unknown,
) {
  await AuditLogModel.create({
    organizationId: tenant.organizationId,
    actorUserId: tenant.userId,
    entityType,
    entityId: String(entityId),
    action,
    before,
    after,
    createdBy: tenant.userEmail,
  });
}

function roomFilter(tenant: TenantContext, query: RoomListQuery) {
  const filter: Record<string, unknown> = {
    organizationId: tenant.organizationId,
  };

  if (query.status !== "all") {
    filter.isActive = query.status === "active";
  }

  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { roomNumber: new RegExp(escaped, "i") },
      { roomType: new RegExp(escaped, "i") },
      { floor: new RegExp(escaped, "i") },
      { wing: new RegExp(escaped, "i") },
    ];
  }

  return filter;
}

export async function listRooms(tenant: TenantContext, query: RoomListQuery) {
  return RoomModel.find(roomFilter(tenant, query))
    .sort({ isActive: -1, roomNumber: 1 })
    .lean();
}

export async function createRoom(
  tenant: TenantContext,
  payload: CreateRoomPayload,
) {
  const count = await RoomModel.countDocuments({
    organizationId: tenant.organizationId,
  });
  if (count >= MAX_ROOMS_PER_ORGANIZATION) {
    throw new ApiError(
      422,
      "Room inventory limit reached. Contact support to increase the limit.",
    );
  }

  const room = await RoomModel.create({
    ...payload,
    organizationId: tenant.organizationId,
    normalizedRoomNumber: normalizeRoomNumber(payload.roomNumber),
    createdByUserId: tenant.userId,
    updatedByUserId: tenant.userId,
  });
  await writeRoomAudit(
    tenant,
    "room",
    room._id,
    "create",
    null,
    room.toObject(),
  );
  return room;
}

export async function updateRoom(
  tenant: TenantContext,
  roomId: string,
  payload: UpdateRoomPayload,
) {
  const room = await RoomModel.findOne({
    _id: roomId,
    organizationId: tenant.organizationId,
  });
  if (!room) {
    throw new ApiError(404, "Room not found");
  }
  if (room.version !== payload.version) {
    throw new ApiError(
      409,
      "This room was changed elsewhere. Refresh it before saving again.",
    );
  }

  if (payload.isActive === false && room.isActive) {
    const activeAllocation = await RoomAllocationModel.exists({
      organizationId: tenant.organizationId,
      roomId: room._id,
      status: { $in: ROOM_ALLOCATION_LOCK_STATUSES },
    });
    if (activeAllocation) {
      throw new ApiError(
        409,
        "This room has an active reservation or check-in and cannot be deactivated.",
      );
    }
  }

  const before = room.toObject();
  if (payload.roomNumber !== undefined) {
    room.roomNumber = payload.roomNumber;
    room.normalizedRoomNumber = normalizeRoomNumber(payload.roomNumber);
  }
  if (payload.roomType !== undefined) room.roomType = payload.roomType;
  if (payload.floor !== undefined) room.floor = payload.floor;
  if (payload.wing !== undefined) room.wing = payload.wing;
  if (payload.capacity !== undefined) room.capacity = payload.capacity;
  if (payload.isActive !== undefined) room.isActive = payload.isActive;
  room.updatedByUserId = new Types.ObjectId(tenant.userId);

  try {
    await room.save();
  } catch (error) {
    if (error instanceof Error && error.name === "VersionError") {
      throw new ApiError(
        409,
        "This room was changed elsewhere. Refresh it before saving again.",
      );
    }
    throw error;
  }

  await writeRoomAudit(
    tenant,
    "room",
    room._id,
    "update",
    before,
    room.toObject(),
  );
  return room;
}

export async function archiveRoom(tenant: TenantContext, roomId: string) {
  const room = await RoomModel.findOne({
    _id: roomId,
    organizationId: tenant.organizationId,
  });
  if (!room) {
    throw new ApiError(404, "Room not found");
  }
  if (!room.isActive) {
    return room;
  }

  const activeAllocation = await RoomAllocationModel.exists({
    organizationId: tenant.organizationId,
    roomId: room._id,
    status: { $in: ROOM_ALLOCATION_LOCK_STATUSES },
  });
  if (activeAllocation) {
    throw new ApiError(
      409,
      "This room has an active reservation or check-in and cannot be deactivated.",
    );
  }

  const before = room.toObject();
  room.isActive = false;
  room.updatedByUserId = new Types.ObjectId(tenant.userId);
  await room.save();
  await writeRoomAudit(
    tenant,
    "room",
    room._id,
    "archive",
    before,
    room.toObject(),
  );
  return room;
}

export async function getRoomAllocations(
  tenant: TenantContext,
  roomId: string,
  query: RoomAllocationHistoryQuery,
) {
  const room = await RoomModel.exists({
    _id: roomId,
    organizationId: tenant.organizationId,
  });
  if (!room) {
    throw new ApiError(404, "Room not found");
  }

  const historyStart = new Date();
  historyStart.setUTCFullYear(historyStart.getUTCFullYear() - 1);
  const filter = {
    organizationId: tenant.organizationId,
    roomId,
    createdAt: { $gte: historyStart },
  };
  const totalItems = await RoomAllocationModel.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(totalItems / ROOM_HISTORY_PAGE_SIZE));
  const page = Math.min(query.page, totalPages);
  const items = await RoomAllocationModel.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * ROOM_HISTORY_PAGE_SIZE)
    .limit(ROOM_HISTORY_PAGE_SIZE)
    .select(
      "invoiceId invoiceNumber roomNumberSnapshot checkinDate checkoutDate status createdAt",
    )
    .lean();

  return {
    items,
    pagination: {
      page,
      pageSize: ROOM_HISTORY_PAGE_SIZE,
      totalItems,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
  };
}

export async function getRoomBookingBoard(
  tenant: TenantContext,
  query: RoomBookingBoardQuery,
) {
  const [rooms, allocations] = await Promise.all([
    RoomModel.find({ organizationId: tenant.organizationId })
      .sort({ isActive: -1, roomNumber: 1 })
      .select("roomNumber roomType floor wing capacity isActive")
      .lean(),
    RoomAllocationModel.find({
      organizationId: tenant.organizationId,
      status: { $in: ROOM_ALLOCATION_LOCK_STATUSES },
      checkinDate: { $lt: query.to },
      checkoutDate: { $gt: query.from },
    })
      .sort({ checkinDate: 1, checkoutDate: 1, createdAt: 1 })
      .select(
        "roomId invoiceNumber roomNumberSnapshot checkinDate checkoutDate status createdAt",
      )
      .lean(),
  ]);

  return { from: query.from, to: query.to, rooms, allocations };
}

export async function listAvailableRooms(
  tenant: TenantContext,
  query: RoomAvailabilityQuery,
) {
  const allocations = await RoomAllocationModel.find({
    organizationId: tenant.organizationId,
    status: { $in: ROOM_ALLOCATION_LOCK_STATUSES },
    checkinDate: { $lt: query.checkoutDate },
    checkoutDate: { $gt: query.checkinDate },
    ...(query.excludeInvoiceId
      ? { invoiceId: { $ne: query.excludeInvoiceId } }
      : {}),
  })
    .select("roomId")
    .lean();

  const unavailableRoomIds = allocations.map((allocation) => allocation.roomId);
  return RoomModel.find({
    organizationId: tenant.organizationId,
    isActive: true,
    _id: { $nin: unavailableRoomIds },
  })
    .sort({ roomNumber: 1 })
    .lean();
}

export async function resolveRoomSnapshots(
  tenant: TenantContext,
  roomIds: string[],
  session?: ClientSession,
): Promise<RoomSnapshot[]> {
  const uniqueRoomIds = [...new Set(roomIds)];
  if (!uniqueRoomIds.length) {
    throw new ApiError(422, "Select at least one room");
  }
  if (uniqueRoomIds.length !== roomIds.length) {
    throw new ApiError(422, "A room can only be selected once per invoice");
  }

  const rooms = await queryWithSession(
    RoomModel.find({
      organizationId: tenant.organizationId,
      _id: { $in: uniqueRoomIds },
      isActive: true,
    }),
    session,
  ).lean();

  if (rooms.length !== uniqueRoomIds.length) {
    throw new ApiError(
      422,
      "One or more selected rooms are unavailable or do not belong to this organization.",
    );
  }

  const roomById = new Map(rooms.map((room) => [String(room._id), room]));
  return roomIds.map((roomId) => {
    const room = roomById.get(roomId);
    if (!room) {
      throw new ApiError(422, "Selected room is unavailable");
    }
    return {
      roomId: String(room._id),
      roomNumber: room.roomNumber,
      roomType: room.roomType || "",
    };
  });
}

export async function syncRoomAllocations(
  tenant: TenantContext,
  input: {
    invoiceId: string;
    invoiceNumber: string;
    rooms: RoomSnapshot[];
    checkinDate: string;
    checkoutDate: string;
    workflowStatus: AllocationWorkflowStatus;
  },
  session: ClientSession,
) {
  if (!isValidStayRange(input.checkinDate, input.checkoutDate)) {
    throw new ApiError(422, "Departure must be after arrival");
  }

  const organizationId = new Types.ObjectId(tenant.organizationId);
  const invoiceId = new Types.ObjectId(input.invoiceId);
  const userId = new Types.ObjectId(tenant.userId);

  if (input.workflowStatus === "cancelled") {
    await RoomAllocationModel.updateMany(
      {
        organizationId,
        invoiceId,
      },
      {
        $set: {
          status: "cancelled",
          updatedByUserId: userId,
        },
      },
      { session },
    );
    return;
  }

  const roomIds = input.rooms.map((room) => new Types.ObjectId(room.roomId));
  if (
    input.workflowStatus === "reserved" ||
    input.workflowStatus === "checkedIn"
  ) {
    const conflicts = await RoomAllocationModel.find({
      organizationId,
      roomId: { $in: roomIds },
      invoiceId: { $ne: invoiceId },
      status: { $in: ROOM_ALLOCATION_LOCK_STATUSES },
      checkinDate: { $lt: input.checkoutDate },
      checkoutDate: { $gt: input.checkinDate },
    })
      .select("roomNumberSnapshot")
      .session(session)
      .lean();

    if (conflicts.length) {
      const rooms = [
        ...new Set(conflicts.map((conflict) => conflict.roomNumberSnapshot)),
      ];
      throw new ApiError(
        409,
        `Selected room${rooms.length === 1 ? " is" : "s are"} no longer available: ${rooms.join(", ")}.`,
      );
    }
  }

  await RoomAllocationModel.updateMany(
    {
      organizationId,
      invoiceId,
      roomId: { $nin: roomIds },
    },
    {
      $set: {
        status: "cancelled",
        updatedByUserId: userId,
      },
    },
    { session },
  );

  await RoomAllocationModel.bulkWrite(
    input.rooms.map((room) => ({
      updateOne: {
        filter: {
          organizationId,
          invoiceId,
          roomId: new Types.ObjectId(room.roomId),
        },
        update: {
          $set: {
            invoiceNumber: input.invoiceNumber,
            roomNumberSnapshot: room.roomNumber,
            checkinDate: input.checkinDate,
            checkoutDate: input.checkoutDate,
            status: input.workflowStatus,
            updatedByUserId: userId,
          },
          $setOnInsert: {
            organizationId,
            roomId: new Types.ObjectId(room.roomId),
            invoiceId,
            createdByUserId: userId,
          },
        },
        upsert: true,
      },
    })),
    { session },
  );
}
