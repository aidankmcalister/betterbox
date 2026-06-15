import waitlistPrisma from "@/lib/waitlist-prisma.server";
import { json, jsonError } from "@/lib/json-response";
import { IS_SELF_HOSTED } from "@/lib/env";
import { createFileRoute } from "@tanstack/react-router";

/** Same loose shape the form validates with — good enough to reject obvious
 *  junk server-side without rejecting valid-but-unusual addresses. */
const EMAIL_RE = /.+@.+\..+/;

export const Route = createFileRoute("/api/waitlist")({
  server: {
    handlers: {
      /** Public, no auth: { email, source? }. Records a hosted-plan waitlist
       *  signup. Re-signups confirm silently (already_registered) so the form
       *  always lands on the same success state. */
      POST: async ({ request }: { request: Request }) => {
        // Self-hosted instances have no waitlist — the endpoint doesn't exist.
        if (IS_SELF_HOSTED) return json({ error: "Not found" }, 404);

        const body = (await request.json().catch(() => null)) as {
          email?: string;
          source?: string;
        } | null;

        const email = body?.email?.trim().toLowerCase();
        if (!email || !EMAIL_RE.test(email)) {
          return json({ error: "Invalid email" }, 400);
        }

        try {
          const existing = await waitlistPrisma.waitlistEntry.findUnique({
            where: { email },
          });
          if (existing) return json({ status: "already_registered" });

          await waitlistPrisma.waitlistEntry.create({
            data: { email, source: body?.source ?? null },
          });
          return json({ status: "ok" });
        } catch (error) {
          return jsonError("waitlist signup", error);
        }
      },
    },
  },
});
