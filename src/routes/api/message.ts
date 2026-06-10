import { auth } from "@/lib/auth";
import { getFullEmail } from "@/lib/gmail/api.server";
import { getGoogleToken } from "@/lib/gmail/accounts.server";
import { json } from "@/lib/json-response";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/message")({
  server: {
    handlers: {
      /** Full message (headers + plain-text body): ?accountId=…&id=… */
      GET: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const url = new URL(request.url);
        const accountId = url.searchParams.get("accountId") ?? undefined;
        const id = url.searchParams.get("id");
        if (!id) return json({ error: "id is required" }, 400);

        const accessToken = await getGoogleToken(
          request.headers,
          session.user.id,
          accountId,
        );
        if (!accessToken) return json({ error: "No Google access token" }, 403);

        try {
          return json({ email: await getFullEmail(accessToken, id) });
        } catch (error) {
          return json({ error: String(error) }, 502);
        }
      },
    },
  },
});
