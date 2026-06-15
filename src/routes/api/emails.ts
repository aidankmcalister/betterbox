import { auth } from "@/lib/auth";
import {
  listRecentEmails,
  markAccountRead,
  markEmailsRead,
  searchEmails,
} from "@/lib/gmail/api.server";
import { getGoogleToken } from "@/lib/gmail/accounts.server";
import { json, jsonError } from "@/lib/json-response";
import { createFileRoute } from "@tanstack/react-router";
import { FOLDER_QUERY, toFolder } from "@/lib/folders";

export const Route = createFileRoute("/api/emails")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const url = new URL(request.url);
        const accountId = url.searchParams.get("accountId") ?? undefined;
        // Clamp so a crafted `max` can't amplify one request into a huge Gmail
        // fan-out (Gmail itself caps at 500; we keep it tighter).
        const max = Math.min(
          Math.max(Number(url.searchParams.get("max")) || 50, 1),
          100,
        );
        const pageToken = url.searchParams.get("pageToken") ?? undefined;
        const q = url.searchParams.get("q")?.trim();
        const folderQuery =
          FOLDER_QUERY[toFolder(url.searchParams.get("folder"))];

        const accessToken = await getGoogleToken(
          request.headers,
          session.user.id,
          accountId,
        );
        if (!accessToken) return json({ error: "No Google access token" }, 403);

        try {
          if (q) {
            const emails = await searchEmails(accessToken, q, max);
            return json({
              accountId: accountId ?? null,
              count: emails.length,
              emails,
            });
          }
          const { emails, nextPageToken } = await listRecentEmails(
            accessToken,
            max,
            pageToken,
            folderQuery,
          );
          return json({
            accountId: accountId ?? null,
            count: emails.length,
            emails,
            nextPageToken: nextPageToken ?? null,
          });
        } catch (error) {
          return jsonError("GET /api/emails", error);
        }
      },

      /** Mark messages read: { accountId, ids } → batchModify -UNREAD. */
      POST: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const body = (await request.json().catch(() => null)) as {
          accountId?: string;
          ids?: unknown;
          all?: boolean;
        } | null;
        if (!body?.accountId) {
          return json({ error: "accountId is required" }, 400);
        }
        const ids = Array.isArray(body.ids)
          ? body.ids.filter((id): id is string => typeof id === "string")
          : [];
        if (!body.all && ids.length === 0) {
          return json({ error: "ids or all is required" }, 400);
        }

        const accessToken = await getGoogleToken(
          request.headers,
          session.user.id,
          body.accountId,
        );
        if (!accessToken) return json({ error: "No Google access token" }, 403);

        try {
          const count = body.all
            ? await markAccountRead(accessToken)
            : (await markEmailsRead(accessToken, ids), ids.length);
          return json({ ok: true, count });
        } catch (error) {
          return jsonError("POST /api/emails", error);
        }
      },
    },
  },
});
