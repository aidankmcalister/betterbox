import { PrismaClient } from "../generated/waitlist/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Dedicated client for the waitlist database, separate from the app's main
// prisma.server client. Public, no-auth writes (the /api/waitlist endpoint)
// land here, isolated from the app's data.
const rawUrl = process.env.WAITLIST_DATABASE_URL;
const waitlistUrl = (rawUrl ?? "").trim();
if (!waitlistUrl) {
  throw new Error("WAITLIST_DATABASE_URL is required");
}

const adapter = new PrismaPg({
  connectionString: waitlistUrl,
});

const waitlistPrisma = new PrismaClient({ adapter });

export { waitlistPrisma };
export default waitlistPrisma;
