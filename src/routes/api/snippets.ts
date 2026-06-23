import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { json, jsonError } from "@/lib/json-response";
import { createFileRoute } from "@tanstack/react-router";

/**
 * Composer text snippets, persisted per BetterBox user (not per Gmail account).
 * GET lists the signed-in user's snippets; POST creates / updates / deletes one.
 * All writes are scoped to `session.user.id` so a user can never touch another
 * user's rows even if they guess an id.
 */
export const Route = createFileRoute("/api/snippets")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        try {
          const snippets = await prisma.snippet.findMany({
            where: { userId: session.user.id },
            orderBy: { trigger: "asc" },
            select: { id: true, trigger: true, text: true },
          });
          return json({ snippets });
        } catch (error) {
          return jsonError("GET /api/snippets", error);
        }
      },

      POST: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);
        const userId = session.user.id;

        const body = (await request.json().catch(() => null)) as {
          op?: "create" | "update" | "delete";
          id?: string;
          trigger?: string;
          text?: string;
        } | null;
        if (!body?.op) return json({ error: "op is required" }, 400);

        try {
          if (body.op === "delete") {
            if (!body.id) return json({ error: "id is required" }, 400);
            await prisma.snippet.deleteMany({ where: { id: body.id, userId } });
            return json({ ok: true });
          }

          const trigger = normalizeTrigger(body.trigger);
          if (!trigger) {
            return json({ error: "Trigger must be a single /word" }, 400);
          }
          const text = (body.text ?? "").trim();
          if (!text) return json({ error: "text is required" }, 400);

          if (body.op === "create") {
            const snippet = await prisma.snippet.create({
              data: { userId, trigger, text },
              select: { id: true, trigger: true, text: true },
            });
            return json({ snippet });
          }

          if (body.op === "update") {
            if (!body.id) return json({ error: "id is required" }, 400);
            const result = await prisma.snippet.updateMany({
              where: { id: body.id, userId },
              data: { trigger, text },
            });
            if (result.count === 0) return json({ error: "Not found" }, 404);
            return json({ snippet: { id: body.id, trigger, text } });
          }

          return json({ error: "Unknown op" }, 400);
        } catch (error) {
          // Unique violation on (userId, trigger) — surface a friendly message
          // instead of a generic 502 so the settings UI can show it inline.
          if (isUniqueViolation(error)) {
            return json({ error: "That trigger is already in use" }, 409);
          }
          return jsonError("POST /api/snippets", error);
        }
      },
    },
  },
});

/** Store triggers as a single `/word` token: force a leading slash, reject
 *  anything with whitespace. Returns null when invalid. */
function normalizeTrigger(raw?: string): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (!/^\/[A-Za-z0-9_-]+$/.test(withSlash)) return null;
  return withSlash;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
