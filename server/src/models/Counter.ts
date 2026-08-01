import { Schema, model } from "mongoose";

const counterSchema = new Schema(
  {
    scope: { type: String, required: true, unique: true, trim: true },
    prefix: { type: String, required: true, trim: true, uppercase: true },
    period: { type: String, required: true, trim: true },
    sequence: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true },
);

counterSchema.index(
  { prefix: 1, period: 1 },
  {
    unique: true,
    partialFilterExpression: {
      prefix: { $type: "string" },
      period: { $type: "string" },
    },
  },
);

export const CounterModel = model("Counter", counterSchema);
