export const ROOM_NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 /-]*$/;

export const ROOM_ALLOCATION_LOCK_STATUSES = ["reserved", "checkedIn"] as const;

export function normalizeRoomNumber(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function isValidStayRange(checkinDate: string, checkoutDate: string) {
  return checkinDate < checkoutDate;
}

export function stayDatesOverlap(
  leftCheckinDate: string,
  leftCheckoutDate: string,
  rightCheckinDate: string,
  rightCheckoutDate: string,
) {
  return (
    leftCheckinDate < rightCheckoutDate && leftCheckoutDate > rightCheckinDate
  );
}
