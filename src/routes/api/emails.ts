import { auth } from "@/lib/auth";
import { listRecentEmails, markEmailsRead } from "@/lib/gmail/api.server";
import { getGoogleToken } from "@/lib/gmail/accounts.server";
import { json } from "@/lib/json-response";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/emails")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const url = new URL(request.url);
        const accountId = url.searchParams.get("accountId") ?? undefined;
        const max = Number(url.searchParams.get("max")) || 50;
        const pageToken = url.searchParams.get("pageToken") ?? undefined;

        const accessToken = await getGoogleToken(
          request.headers,
          session.user.id,
          accountId,
        );
        if (!accessToken) return json({ error: "No Google access token" }, 403);

        try {
          const { emails, nextPageToken } = await listRecentEmails(
            accessToken,
            max,
            pageToken,
          );
          return json({
            accountId: accountId ?? null,
            count: emails.length,
            emails,
            nextPageToken: nextPageToken ?? null,
          });
        } catch (error) {
          return json({ error: String(error) }, 502);
        }
      },

      /** Mark messages read: { accountId, ids } → batchModify -UNREAD. */
      POST: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const body = (await request.json().catch(() => null)) as {
          accountId?: string;
          ids?: unknown;
        } | null;
        const ids = Array.isArray(body?.ids)
          ? body.ids.filter((id): id is string => typeof id === "string")
          : [];
        if (!body?.accountId || ids.length === 0) {
          return json({ error: "accountId and ids are required" }, 400);
        }

        const accessToken = await getGoogleToken(
          request.headers,
          session.user.id,
          body.accountId,
        );
        if (!accessToken) return json({ error: "No Google access token" }, 403);

        try {
          await markEmailsRead(accessToken, ids);
          return json({ ok: true, count: ids.length });
        } catch (error) {
          return json({ error: String(error) }, 502);
        }
      },
    },
  },
});
