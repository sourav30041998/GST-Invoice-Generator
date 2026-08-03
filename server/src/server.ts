import { app } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase } from "./db/mongoose.js";

async function bootstrap() {
  await connectDatabase();
  app.listen(env.PORT, () => {
    console.log(`GST invoice API listening on port ${env.PORT}`);
  });
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  console.error(`Failed to start API: ${message}`);
  process.exit(1);
});