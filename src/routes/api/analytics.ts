import { auth } from "@/lib/auth";
import { getAnalytics } from "@/lib/gmail/api.server";
import { getGoogleToken } from "@/lib/gmail/accounts.server";
import { json } from "@/lib/json-response";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/analytics")({
  server: {
    handlers: {
      /** Real mailbox metrics for one account: ?accountId=…&days=30. */
      GET: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const url = new URL(request.url);
        const accountId = url.searchParams.get("accountId") ?? undefined;
        const days = Math.min(90, Number(url.searchParams.get("days")) || 30);

        const accessToken = await getGoogleToken(
          request.headers,
          session.user.id,
          accountId,
        );
        if (!accessToken) return json({ error: "No Google access token" }, 403);

        try {
          const analytics = await getAnalytics(accessToken, days);
          return json({ accountId: accountId ?? null, analytics });
        } catch (error) {
          return json({ error: String(error) }, 502);
        }
      },
    },
  },
});
