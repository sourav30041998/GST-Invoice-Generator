import mongoose from "mongoose";
import { env } from "../config/env.js";

export async function connectDatabase() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGODB_URI, {
    autoIndex: false,
    dbName: env.MONGODB_DB_NAME,
    ...(env.MONGODB_IP_FAMILY ? { family: env.MONGODB_IP_FAMILY } : {}),
  });
}
