import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// DATABASE_URL on Replit and locally; POSTGRES_URL is what the Supabase
// integration on Vercel provides.
const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL (or POSTGRES_URL) must be set. Did you forget to provision a database?",
  );
}

// pg 8 treats sslmode=require as verify-full, which rejects the certificate
// chain of Supabase's connection pooler. For Supabase hosts, use libpq's
// meaning of require instead: the connection is still encrypted.
function withSupabaseSsl(url: string): string {
  const parsed = new URL(url);
  if (
    /\.supabase\.(co|com)$/.test(parsed.hostname) &&
    parsed.searchParams.get("sslmode") === "require" &&
    !parsed.searchParams.has("uselibpqcompat")
  ) {
    parsed.searchParams.set("uselibpqcompat", "true");
  }
  return parsed.toString();
}

export const pool = new Pool({ connectionString: withSupabaseSsl(databaseUrl) });
export const db = drizzle(pool, { schema });

export * from "./schema";
