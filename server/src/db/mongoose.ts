import mongoose from "mongoose";
import { env } from "../config/env.js";

export async function connectDatabase() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGODB_URI, {
<<<<<<< HEAD
    autoIndex: env.NODE_ENV !== "production"
=======
    autoIndex: env.NODE_ENV !== "production",
    dbName: env.MONGODB_DB_NAME,
    ...(env.MONGODB_IP_FAMILY ? { family: env.MONGODB_IP_FAMILY } : {}),
>>>>>>> codex/backend-api-data
  });
}
