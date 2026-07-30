import { app } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase } from "./db/mongoose.js";

async function bootstrap() {
  await connectDatabase();
  app.listen(env.PORT, () => {
    console.log(`GST invoice API listening on port ${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start API", error);
  process.exit(1);
});
