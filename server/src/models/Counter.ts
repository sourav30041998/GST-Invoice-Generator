import { Schema, model } from "mongoose";

const counterSchema = new Schema(
  {
    scope: { type: String, required: true, unique: true, trim: true },
    sequence: { type: Number, required: true, min: 0, default: 0 }
  },
  { timestamps: true }
);

export const CounterModel = model("Counter", counterSchema);
