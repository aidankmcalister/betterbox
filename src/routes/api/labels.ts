import { auth } from "@/lib/auth";
import {
  createLabel,
  deleteLabel,
  listLabels,
  modifyMessageLabels,
  renameLabel,
} from "@/lib/gmail/api.server";
import { getGoogleToken } from "@/lib/gmail/accounts.server";
import { json } from "@/lib/json-response";
import { createFileRoute } from "@tanstack/react-router";

/**
 * Tags = Gmail labels. Nothing here is persisted by BetterBox — labels and
 * their application live in the user's Gmail (gmail.modify scope). GET lists
 * labels; POST creates a label or tags/untags a message.
 */
export const Route = createFileRoute("/api/labels")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const accountId =
          new URL(request.url).searchParams.get("accountId") ?? undefined;
        const accessToken = await getGoogleToken(
          request.headers,
          session.user.id,
          accountId,
        );
        if (!accessToken) return json({ error: "No Google access token" }, 403);

        try {
          return json({ labels: await listLabels(accessToken) });
        } catch (error) {
          return json({ error: String(error) }, 502);
        }
      },

      POST: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const body = (await request.json().catch(() => null)) as {
          accountId?: string;
          op?: "create" | "apply" | "remove" | "rename" | "delete";
          name?: string;
          id?: string;
          labelId?: string;
        } | null;
        if (!body?.accountId || !body.op) {
          return json({ error: "accountId and op are required" }, 400);
        }

        const accessToken = await getGoogleToken(
          request.headers,
          session.user.id,
          body.accountId,
        );
        if (!accessToken) return json({ error: "No Google access token" }, 403);

        try {
          if (body.op === "create") {
            if (!body.name?.trim()) {
              return json({ error: "name is required" }, 400);
            }
            return json({
              label: await createLabel(accessToken, body.name.trim()),
            });
          }
          if (body.op === "rename") {
            if (!body.labelId || !body.name?.trim()) {
              return json({ error: "labelId and name are required" }, 400);
            }
            return json({
              label: await renameLabel(
                accessToken,
                body.labelId,
                body.name.trim(),
              ),
            });
          }
          if (body.op === "delete") {
            if (!body.labelId)
              return json({ error: "labelId is required" }, 400);
            await deleteLabel(accessToken, body.labelId);
            return json({ ok: true });
          }
          if (!body.id || !body.labelId) {
            return json({ error: "id and labelId are required" }, 400);
          }
          const [add, remove] =
            body.op === "apply" ? [[body.labelId], []] : [[], [body.labelId]];
          await modifyMessageLabels(accessToken, body.id, add, remove);
          return json({ ok: true });
        } catch (error) {
          return json({ error: String(error) }, 502);
        }
      },
    },
  },
});
