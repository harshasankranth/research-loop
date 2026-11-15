import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (e.g. CI): fall through to the real environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/schema.ts",
  // drizzle/0000_init.sql is the hand-written schema from the brief (§11);
  // generated migrations go next to it, not on top of it.
  out: "./drizzle/migrations",
  dbCredentials: { url: process.env.DATABASE_URL! },
  schemaFilter: ["public"],
  entities: { roles: { provider: "supabase" } },
});
