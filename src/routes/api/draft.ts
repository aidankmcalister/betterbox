import { auth } from "@/lib/auth/auth";
import { findGmailDraftId, saveGmailDraft } from "@/lib/gmail/api.server";
import { getGoogleToken } from "@/lib/gmail/accounts.server";
import { json, jsonError } from "@/lib/json-response";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/draft")({
  server: {
    handlers: {
      /** Resolve the Gmail draft id backing an opened draft's message id, so
       *  edits can update it in place instead of creating a duplicate. */
      GET: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const url = new URL(request.url);
        const accountId = url.searchParams.get("accountId") ?? "";
        const messageId = url.searchParams.get("messageId") ?? "";
        if (!accountId || !messageId) {
          return json({ error: "accountId and messageId are required" }, 400);
        }

        const accessToken = await getGoogleToken(
          request.headers,
          session.user.id,
          accountId,
        );
        if (!accessToken) return json({ error: "No Google access token" }, 403);

        try {
          const draftId = await findGmailDraftId(accessToken, messageId);
          return json({ draftId });
        } catch (err) {
          return jsonError("draft id lookup", err);
        }
      },
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
