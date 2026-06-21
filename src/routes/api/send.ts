import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/gmail/api.server";
import { getGoogleToken } from "@/lib/gmail/accounts.server";
import { json, jsonError } from "@/lib/json-response";
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
          cc?: string;
          subject?: string;
          body?: string;
          html?: string;
          inReplyTo?: string;
          references?: string;
          threadId?: string;
          attachments?: {
            filename: string;
            mimeType: string;
            contentBase64: string;
          }[];
        } | null;
        if (!body?.accountId || !body.to?.trim()) {
          return json({ error: "accountId and to are required" }, 400);
        }

        // Cap total attachment size (~25 MB decoded ≈ 34 MB of base64), at or
        // below Gmail's send limit, so a huge payload can't be forced through.
        const attachmentBytes = (body.attachments ?? []).reduce(
          (sum, a) => sum + (a.contentBase64?.length ?? 0),
          0,
        );
        if (attachmentBytes > 34_000_000) {
          return json({ error: "Attachments too large (25 MB max)" }, 413);
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
            cc: body.cc?.trim() || undefined,
            subject: body.subject ?? "",
            body: body.body ?? "",
            html: body.html,
            inReplyTo: body.inReplyTo,
            references: body.references,
            threadId: body.threadId,
            attachments: body.attachments,
          });
          return json({ ok: true });
        } catch (error) {
          return jsonError("POST /api/send", error);
        }
      },
    },
  },
});
