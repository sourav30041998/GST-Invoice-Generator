import { defaultIndianStates } from "../config/indianStates.js";
import { ReferenceDataModel } from "../models/ReferenceData.js";

const INDIAN_STATE_TYPE = "indian_state";

export async function ensureDefaultIndianStates() {
  const existingCount = await ReferenceDataModel.countDocuments({
    type: INDIAN_STATE_TYPE,
  });
  if (existingCount > 0) {
    return;
  }

  await ReferenceDataModel.bulkWrite(
    defaultIndianStates.map((state) => ({
      updateOne: {
        filter: { type: INDIAN_STATE_TYPE, code: state.code },
        update: {
          $setOnInsert: {
            type: INDIAN_STATE_TYPE,
            code: state.code,
            label: state.label,
            aliases: [],
            metadata: {},
            active: true,
            sortOrder: state.sortOrder,
          },
        },
        upsert: true,
      },
    })),
  );
}

export async function listIndianStates() {
  await ensureDefaultIndianStates();
  const states = await ReferenceDataModel.find({
    type: INDIAN_STATE_TYPE,
    active: true,
  })
    .sort({ sortOrder: 1, label: 1 })
    .lean();
  return states.map((state) => state.label);
}
