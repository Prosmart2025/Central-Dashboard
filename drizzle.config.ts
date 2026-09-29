import { defineConfig } from "drizzle-kit";
import "dotenv/config";

/**
 * Schema pushes use a DIRECT (non-pooled) connection.
 * Neon's pooler is optimised for short-lived app queries, whereas DDL is more
 * reliable over the direct endpoint.
 */
const migrationUrl =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5432/app_db";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: migrationUrl,
  },
});
