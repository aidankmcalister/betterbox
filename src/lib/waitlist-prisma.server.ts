import { PrismaClient } from "../generated/waitlist/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Dedicated client for the hosted-plan waitlist database, separate from the
// app's main prisma.server client. Hosted-only: self-host instances disable the
// /api/waitlist endpoint and never set WAITLIST_DATABASE_URL. Created lazily so
// importing this module stays side-effect-free — an eager client would throw on
// every instance, self-host included.
let client: PrismaClient | undefined;

export function getWaitlistPrisma(): PrismaClient {
  if (!client) {
    const url = (process.env.WAITLIST_DATABASE_URL ?? "").trim();
    if (!url) throw new Error("WAITLIST_DATABASE_URL is required");
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  }
  return client;
}
