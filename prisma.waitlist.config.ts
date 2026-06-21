import { defineConfig } from "prisma/config";

// Separate config for the hosted-plan waitlist DB. Hosted-only: self-host
// instances never set WAITLIST_DATABASE_URL, so read it via process.env with a
// placeholder fallback. `prisma generate` (run by postinstall on every clone)
// never connects, so the placeholder lets the client generate without the var;
// real db:*:waitlist commands pass the actual URL via --env-file=.env.
export default defineConfig({
  schema: "prisma/waitlist.prisma",
  datasource: {
    url: process.env.WAITLIST_DATABASE_URL || "postgresql://localhost:5432/db",
  },
});
