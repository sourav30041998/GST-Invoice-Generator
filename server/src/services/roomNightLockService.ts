import type { ClientSession } from "mongoose";
import { Types } from "mongoose";
import { ApiError } from "../middleware/errorHandler.js";
import { RoomNightLockModel } from "../models/RoomNightLock.js";
import { bookingStayDates } from "../utils/bookingRules.js";

type LockSourceType = "booking" | "invoice";

export async function releaseRoomNightLocks(
  organizationId: string,
  sourceType: LockSourceType,
  sourceId: string,
  session: ClientSession,
) {
  await RoomNightLockModel.deleteMany(
    {
      organizationId,
      sourceType,
      sourceId: new Types.ObjectId(sourceId),
    },
    { session },
  );
}

export async function replaceRoomNightLocks(
  input: {
    organizationId: string;
    sourceType: LockSourceType;
    sourceId: string;
    sourceLabel: string;
    roomIds: string[];
    checkinDate: string;
    checkoutDate: string;
    active: boolean;
  },
  session: ClientSession,
) {
  await releaseRoomNightLocks(
    input.organizationId,
    input.sourceType,
    input.sourceId,
    session,
  );
  if (!input.active || !input.roomIds.length) {
    return;
  }

  const stayDates = bookingStayDates(input.checkinDate, input.checkoutDate);
  const sourceId = new Types.ObjectId(input.sourceId);
  const roomIds = input.roomIds.map((roomId) => new Types.ObjectId(roomId));
  const conflict = await RoomNightLockModel.findOne({
    organizationId: input.organizationId,
    roomId: { $in: roomIds },
    stayDate: { $in: stayDates },
    $or: [{ sourceType: { $ne: input.sourceType } }, { sourceId: { $ne: sourceId } }],
  })
    .select("sourceLabel stayDate")
    .session(session)
    .lean();
  if (conflict) {
    throw new ApiError(
      409,
      `A selected room is already reserved on ${conflict.stayDate} (${conflict.sourceLabel}).`,
    );
  }

  const locks = roomIds.flatMap((roomId) =>
    stayDates.map((stayDate) => ({
      organizationId: new Types.ObjectId(input.organizationId),
      roomId,
      stayDate,
      sourceType: input.sourceType,
      sourceId,
      sourceLabel: input.sourceLabel,
    })),
  );

  try {
    await RoomNightLockModel.insertMany(locks, { session, ordered: true });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new ApiError(
        409,
        "A selected room was reserved by another user. Refresh availability and try again.",
      );
    }
    throw error;
  }
}
