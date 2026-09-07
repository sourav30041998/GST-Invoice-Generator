const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

export const MAX_BOOKING_STAY_DAYS = 365;

export function bookingStayDates(checkinDate: string, checkoutDate: string) {
  const start = Date.parse(`${checkinDate}T00:00:00.000Z`);
  const end = Date.parse(`${checkoutDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new Error("Departure must be after arrival");
  }

  const nights = (end - start) / DAY_MILLISECONDS;
  if (!Number.isInteger(nights) || nights > MAX_BOOKING_STAY_DAYS) {
    throw new Error(
      `A booking cannot exceed ${MAX_BOOKING_STAY_DAYS} nights`,
    );
  }

  return Array.from({ length: nights }, (_, index) =>
    new Date(start + index * DAY_MILLISECONDS).toISOString().slice(0, 10),
  );
}

export function rupeesToMinorUnits(value: number) {
  const amount = Math.round(value * 100);
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("Amount is outside the supported range");
  }
  return amount;
}

export function minorUnitsToRupees(value: number) {
  return Number((value / 100).toFixed(2));
}
