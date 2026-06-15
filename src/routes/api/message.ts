import { auth } from "@/lib/auth";
import {
  actOnEmail,
  getAttachment,
  getFullEmail,
  getRawEmail,
  getThread,
  type MessageAction,
} from "@/lib/gmail/api.server";
import { getGoogleToken } from "@/lib/gmail/accounts.server";
import { json, jsonError } from "@/lib/json-response";
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
        const thread = url.searchParams.get("thread");
        const id = url.searchParams.get("id");
        const attachment = url.searchParams.get("attachment");
        if (!thread && !id) return json({ error: "id is required" }, 400);

        const accessToken = await getGoogleToken(
          request.headers,
          session.user.id,
          accountId,
        );
        if (!accessToken) return json({ error: "No Google access token" }, 403);

        try {
          if (thread) {
            return json({ messages: await getThread(accessToken, thread) });
          }
          // Inline (cid:) attachment bytes for the reader's image rendering.
          if (attachment && id) {
            const bytes = await getAttachment(accessToken, id, attachment);
            const mime = url.searchParams.get("mime") ?? "";
            // Only honor an image type (these render in <img>); else generic.
            const type = /^image\/[\w.+-]+$/i.test(mime)
              ? mime
              : "application/octet-stream";
            return new Response(bytes, {
              headers: {
                "content-type": type,
                "cache-control": "private, max-age=86400",
              },
            });
          }
          if (url.searchParams.get("format") === "raw") {
            return json({ raw: await getRawEmail(accessToken, id!) });
          }
          return json({ email: await getFullEmail(accessToken, id!) });
        } catch (error) {
          return jsonError("GET /api/message", error);
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
          return jsonError("POST /api/message", error);
        }
      },
    },
  },
});
