import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma.server";
import { json, jsonError } from "@/lib/json-response";
import { createFileRoute } from "@tanstack/react-router";

/**
 * Email signatures, per BetterBox user, with flexible per-account assignment.
 * Signatures are user-scoped; each connected Google account points at one (or
 * none) via Account.signatureId, so accounts can share a signature or each have
 * their own. GET returns the signatures + an accountId→signatureId map; POST
 * creates/updates/deletes a signature or assigns one to an account. All writes
 * are scoped to session.user.id.
 */
export const Route = createFileRoute("/api/signatures")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);
        const userId = session.user.id;

        try {
          const [signatures, accounts] = await Promise.all([
            prisma.signature.findMany({
              where: { userId },
              orderBy: { name: "asc" },
              select: { id: true, name: true, body: true },
            }),
            prisma.account.findMany({
              where: { userId, providerId: "google" },
              select: { accountId: true, signatureId: true },
            }),
          ]);
          const assignments: Record<string, string | null> = {};
          for (const a of accounts) assignments[a.accountId] = a.signatureId;
          return json({ signatures, assignments });
        } catch (error) {
          return jsonError("GET /api/signatures", error);
        }
      },

      POST: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);
        const userId = session.user.id;

        const payload = (await request.json().catch(() => null)) as {
          op?: "create" | "update" | "delete" | "assign";
          id?: string;
          name?: string;
          body?: string;
          accountId?: string;
          signatureId?: string | null;
        } | null;
        if (!payload?.op) return json({ error: "op is required" }, 400);

        try {
          if (payload.op === "delete") {
            if (!payload.id) return json({ error: "id is required" }, 400);
            // onDelete: SetNull on Account.signatureId clears any assignments.
            await prisma.signature.deleteMany({
              where: { id: payload.id, userId },
            });
            return json({ ok: true });
          }

          if (payload.op === "assign") {
            if (!payload.accountId) {
              return json({ error: "accountId is required" }, 400);
            }
            const signatureId = payload.signatureId ?? null;
            // Only assign a signature the user actually owns.
            if (signatureId) {
              const owned = await prisma.signature.findFirst({
                where: { id: signatureId, userId },
                select: { id: true },
              });
              if (!owned) return json({ error: "Unknown signature" }, 400);
            }
            const result = await prisma.account.updateMany({
              where: {
                userId,
                providerId: "google",
                accountId: payload.accountId,
              },
              data: { signatureId },
            });
            if (result.count === 0) {
              return json({ error: "Account not found" }, 404);
            }
            return json({ ok: true });
          }

          // create / update
          const name = (payload.name ?? "").trim();
          const sigBody = (payload.body ?? "").trim();
          if (!name) return json({ error: "name is required" }, 400);
          if (!sigBody) return json({ error: "body is required" }, 400);

          if (payload.op === "create") {
            const signature = await prisma.signature.create({
              data: { userId, name, body: sigBody },
              select: { id: true, name: true, body: true },
            });
            return json({ signature });
          }

          if (payload.op === "update") {
            if (!payload.id) return json({ error: "id is required" }, 400);
            const result = await prisma.signature.updateMany({
              where: { id: payload.id, userId },
              data: { name, body: sigBody },
            });
            if (result.count === 0) return json({ error: "Not found" }, 404);
            return json({ signature: { id: payload.id, name, body: sigBody } });
          }

          return json({ error: "Unknown op" }, 400);
        } catch (error) {
          return jsonError("POST /api/signatures", error);
        }
      },
    },
  },
});
