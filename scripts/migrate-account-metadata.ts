import { config } from "dotenv";
import { sql } from "drizzle-orm";

config({ path: ".env", quiet: true });
const production = process.argv.includes("--production");
if (production) {
  const value = process.env.DATABASE_URL_UNPOOLED;
  if (!value || value === "[SENSITIVE]") throw new Error("A server-side direct database URL is required.");
  const url = new URL(value);
  if (!url.hostname.endsWith("neon.tech")) throw new Error("Expected the dedicated Neon project.");
  // The Vercel dashboard uses the isolated database established for this app.
  url.pathname = "/tuya_panel";
  process.env.DATABASE_URL = url.toString();
}

async function main() {
const { db, getPool } = await import("../src/db/index");
try {
  await db.execute(sql`ALTER TABLE devices ADD COLUMN IF NOT EXISTS integration jsonb`);
  await db.execute(sql`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS integration jsonb`);
  await db.execute(sql`ALTER TABLE scenes ADD COLUMN IF NOT EXISTS integration jsonb`);
  console.log(`${production ? "Dedicated production" : "Local"} metadata columns ready; no tables or data removed.`);
} finally { await getPool().end(); }

}
main().catch((error) => { console.error("Metadata migration failed:", error.cause?.code || error.code || error.name); process.exitCode=1; });
