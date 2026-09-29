import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsPostgresqlDb?: NodePgDatabase<Record<string, never>>;
};

/**
 * Resolve the pool lazily.
 *
 * Hosts such as Vercel/Netlify import modules during the build step, before
 * runtime environment variables are necessarily present. Throwing at import
 * time would fail the build, so the connection is only created on first use.
 */
export function getPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required. Set it in your hosting provider's environment variables (for example a Neon or Supabase connection string)."
    );
  }

  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    globalForDb.__arenaNextJsPostgresqlPool = new Pool({
      connectionString: databaseUrl,
      // Managed Postgres providers (Neon, Supabase, RDS) terminate plaintext connections.
      ssl: /\bsslmode=require\b/.test(databaseUrl) ? { rejectUnauthorized: false } : undefined,
    });
  }

  return globalForDb.__arenaNextJsPostgresqlPool;
}

function getDb(): NodePgDatabase<Record<string, never>> {
  if (!globalForDb.__arenaNextJsPostgresqlDb) {
    globalForDb.__arenaNextJsPostgresqlDb = drizzle(getPool());
  }
  return globalForDb.__arenaNextJsPostgresqlDb;
}

/**
 * Proxy keeps the existing `import { db } from "@/db"` call sites working while
 * deferring the actual connection until a query is executed.
 */
export const db = new Proxy({} as NodePgDatabase<Record<string, never>>, {
  get(_target, property, receiver) {
    return Reflect.get(getDb(), property, receiver);
  },
});

export const pool = new Proxy({} as Pool, {
  get(_target, property, receiver) {
    return Reflect.get(getPool(), property, receiver);
  },
});
