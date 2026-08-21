import assert from "node:assert/strict";
import test from "node:test";
import { roomAllocationHistoryQuerySchema } from "../validation/roomSchemas.js";

test("bounds room allocation history pages", () => {
  assert.deepEqual(roomAllocationHistoryQuerySchema.parse({}), { page: 1 });
  assert.deepEqual(roomAllocationHistoryQuerySchema.parse({ page: "25" }), {
    page: 25,
  });
  assert.throws(() => roomAllocationHistoryQuerySchema.parse({ page: 0 }));
  assert.throws(() => roomAllocationHistoryQuerySchema.parse({ page: 1001 }));
  assert.throws(() =>
    roomAllocationHistoryQuerySchema.parse({ page: 1, limit: 100 }),
  );
});
