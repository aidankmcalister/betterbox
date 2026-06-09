import { auth } from "@/lib/auth";
import { listRecentEmails } from "@/lib/gmail/api.server";
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

        const accessToken = await getGoogleToken(
          request.headers,
          session.user.id,
          accountId,
        );
        if (!accessToken) return json({ error: "No Google access token" }, 403);

        try {
          const emails = await listRecentEmails(accessToken, max);
          return json({ accountId: accountId ?? null, count: emails.length, emails });
        } catch (error) {
          return json({ error: String(error) }, 502);
        }
      },
    },
  },
});
