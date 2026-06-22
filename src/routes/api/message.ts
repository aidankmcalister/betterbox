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
          // Attachment bytes: inline (cid:) images for the reader, or a named
          // attachment download (&download=1).
          if (attachment && id) {
            const bytes = await getAttachment(accessToken, id, attachment);
            const mime = url.searchParams.get("mime") ?? "";
            if (url.searchParams.get("download") === "1") {
              // Force a download so nothing renders inline same-origin (e.g. an
              // HTML attachment can't execute as a page). Sanitize the filename.
              const filename = (
                url.searchParams.get("filename") || "attachment"
              )
                .replace(/[^\w.\- ]+/g, "_")
                .slice(0, 200);
              const type = /^[\w.+-]+\/[\w.+-]+$/.test(mime)
                ? mime
                : "application/octet-stream";
              return new Response(bytes, {
                headers: {
                  "content-type": type,
                  "content-disposition": `attachment; filename="${filename}"`,
                  "cache-control": "private, max-age=86400",
                },
              });
            }
            // Open-in-new-tab view: render only types that are safe to load as a
            // top-level same-origin document (no scripting). Anything else — html,
            // svg, office docs — is forced to download so it can't execute.
            if (url.searchParams.get("view") === "1") {
              const viewable =
                /^(image\/(png|jpe?g|gif|webp|avif)|application\/pdf|text\/plain)$/i.test(
                  mime,
                );
              return new Response(bytes, {
                headers: {
                  "content-type": viewable ? mime : "application/octet-stream",
                  "x-content-type-options": "nosniff",
                  ...(viewable ? {} : { "content-disposition": "attachment" }),
                  "cache-control": "private, max-age=86400",
                },
              });
            }
            // Inline (cid:) image bytes for the reader's <img> rendering.
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
          // Past the thread/attachment branches, a message id is required.
          if (!id) return json({ error: "id is required" }, 400);
          if (url.searchParams.get("format") === "raw") {
            return json({ raw: await getRawEmail(accessToken, id) });
          }
          return json({ email: await getFullEmail(accessToken, id) });
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
