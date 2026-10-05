import type { BookingRoomRequest } from "../types";

export const MAX_BOOKING_ESTIMATE = 9_999_999_999;

export function accommodationTotal(
  rows: Pick<BookingRoomRequest, "quantity" | "tariffPerRoom">[],
) {
  return (
    rows.reduce(
      (total, row) =>
        total + Math.round((row.tariffPerRoom || 0) * 100) * row.quantity,
      0,
    ) / 100
  );
}
