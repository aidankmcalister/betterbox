import { auth } from "@/lib/auth";
import { saveGmailDraft } from "@/lib/gmail/api.server";
import { getGoogleToken } from "@/lib/gmail/accounts.server";
import { json, jsonError } from "@/lib/json-response";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/draft")({
  server: {
    handlers: {
      /** Create or update a Gmail draft (autosave). Pass `draftId` to update an
       *  existing one. The From address always comes from the account profile. */
      POST: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const body = (await request.json().catch(() => null)) as {
          accountId?: string;
          draftId?: string;
          to?: string;
          cc?: string;
          bcc?: string;
          subject?: string;
          html?: string;
          threadId?: string;
        } | null;
        if (!body?.accountId) {
          return json({ error: "accountId is required" }, 400);
        }

        const accessToken = await getGoogleToken(
          request.headers,
          session.user.id,
          body.accountId,
        );
        if (!accessToken) return json({ error: "No Google access token" }, 403);

        try {
          const draft = await saveGmailDraft(accessToken, {
            draftId: body.draftId,
            to: body.to?.trim() ?? "",
            cc: body.cc?.trim() || undefined,
            bcc: body.bcc?.trim() || undefined,
            subject: body.subject ?? "",
            body: "",
            html: body.html,
            threadId: body.threadId,
          });
          return json(draft);
        } catch (err) {
          return jsonError("draft save", err);
        }
      },
    },
  },
});
