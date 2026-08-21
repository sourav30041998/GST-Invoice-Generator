import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidStayRange,
  normalizeRoomNumber,
  ROOM_NUMBER_PATTERN,
  stayDatesOverlap,
} from "./roomRules.js";

test("normalizes room codes without changing their approved structure", () => {
  assert.equal(normalizeRoomNumber("  east / 101-a  "), "EAST / 101-A");
  assert.equal(ROOM_NUMBER_PATTERN.test("Villa / 7-A"), true);
  assert.equal(ROOM_NUMBER_PATTERN.test("101<script>"), false);
});

test("requires a checkout date after the check-in date", () => {
  assert.equal(isValidStayRange("2026-08-10", "2026-08-11"), true);
  assert.equal(isValidStayRange("2026-08-10", "2026-08-10"), false);
  assert.equal(isValidStayRange("2026-08-11", "2026-08-10"), false);
});

test("treats checkout as the first free day for a room", () => {
  assert.equal(
    stayDatesOverlap("2026-08-10", "2026-08-12", "2026-08-12", "2026-08-14"),
    false,
  );
  assert.equal(
    stayDatesOverlap("2026-08-10", "2026-08-12", "2026-08-11", "2026-08-13"),
    true,
  );
});
