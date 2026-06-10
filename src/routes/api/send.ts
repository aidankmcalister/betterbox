import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/gmail/api.server";
import { getGoogleToken } from "@/lib/gmail/accounts.server";
import { json } from "@/lib/json-response";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/send")({
  server: {
    handlers: {
      /** Send plain text: { accountId, to, subject, body }. The From address
       *  always comes from the account's own profile — never the client. */
      POST: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const body = (await request.json().catch(() => null)) as {
          accountId?: string;
          to?: string;
          subject?: string;
          body?: string;
          inReplyTo?: string;
          references?: string;
          threadId?: string;
        } | null;
        if (!body?.accountId || !body.to?.trim()) {
          return json({ error: "accountId and to are required" }, 400);
        }

        const accessToken = await getGoogleToken(
          request.headers,
          session.user.id,
          body.accountId,
        );
        if (!accessToken) return json({ error: "No Google access token" }, 403);

        try {
          await sendEmail(accessToken, {
            to: body.to.trim(),
            subject: body.subject ?? "",
            body: body.body ?? "",
            inReplyTo: body.inReplyTo,
            references: body.references,
            threadId: body.threadId,
          });
          return json({ ok: true });
        } catch (error) {
          return json({ error: String(error) }, 502);
        }
      },
    },
  },
});
