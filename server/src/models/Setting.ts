import { Schema, model } from "mongoose";

const settingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, minimize: false },
);

export const SettingModel = model("Setting", settingSchema);
