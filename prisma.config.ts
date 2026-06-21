import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Read via process.env with a placeholder fallback so `prisma generate`
    // (run by postinstall, before .env exists on a fresh clone) never fails to
    // resolve the variable. generate never connects; the db:* scripts pass the
    // real DATABASE_URL via --env-file=.env.
    url: process.env.DATABASE_URL || "postgresql://localhost:5432/db",
  },
});
