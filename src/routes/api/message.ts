import { auth } from "@/lib/auth";
import {
  actOnEmail,
  getFullEmail,
  getRawEmail,
  type MessageAction,
} from "@/lib/gmail/api.server";
import { getGoogleToken } from "@/lib/gmail/accounts.server";
import { json } from "@/lib/json-response";
import { createFileRoute } from "@tanstack/react-router";

const ACTIONS: MessageAction[] = ["archive", "trash", "star", "unstar"];

export const Route = createFileRoute("/api/message")({
  server: {
    handlers: {
      /** Full message: ?accountId=…&id=… (+&format=raw for RFC 822 source) */
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
          if (url.searchParams.get("format") === "raw") {
            return json({ raw: await getRawEmail(accessToken, id) });
          }
          return json({ email: await getFullEmail(accessToken, id) });
        } catch (error) {
          return json({ error: String(error) }, 502);
        }
      },

      /** Single-message action: { accountId, id, action }. */
      POST: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const body = (await request.json().catch(() => null)) as {
          accountId?: string;
          id?: string;
          action?: MessageAction;
        } | null;
        if (!body?.id || !body.action || !ACTIONS.includes(body.action)) {
          return json({ error: "id and a valid action are required" }, 400);
        }

        const accessToken = await getGoogleToken(
          request.headers,
          session.user.id,
          body.accountId,
        );
        if (!accessToken) return json({ error: "No Google access token" }, 403);

        try {
          await actOnEmail(accessToken, body.id, body.action);
          return json({ ok: true });
        } catch (error) {
          return json({ error: String(error) }, 502);
        }
      },
    },
  },
});
