import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Separate config for the waitlist DB (WAITLIST_DATABASE_URL). Use with the CLI
// via `--config prisma.waitlist.config.ts` (see the db:*:waitlist scripts).
export default defineConfig({
  schema: "prisma/waitlist.prisma",
  datasource: {
    url: env("WAITLIST_DATABASE_URL"),
  },
});
