import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma.server";
import { getGoogleToken } from "@/lib/gmail/accounts.server";
import { searchEmails } from "@/lib/gmail/api.server";
import { json } from "@/lib/json-response";
import {
  isRuleValid,
  ruleToGmailQuery,
  type Action,
  type Condition,
  type MatchMode,
} from "@/lib/rules";

type RuleBody = {
  name?: string | null;
  accountIds?: string[];
  match?: MatchMode;
  conditions?: Condition[];
  actions?: Action[];
  applyToExisting?: boolean;
};

function normalize(body: RuleBody) {
  const conditions = Array.isArray(body.conditions) ? body.conditions : [];
  const actions = Array.isArray(body.actions) ? body.actions : [];
  if (!isRuleValid({ conditions, actions })) {
    throw new Error("a rule needs a complete condition and at least one action");
  }
  return {
    name: body.name?.trim() || null,
    accountIds: Array.isArray(body.accountIds) ? body.accountIds : [],
    match: (body.match === "any" ? "any" : "all") as MatchMode,
    conditions,
    actions,
    applyToExisting: Boolean(body.applyToExisting),
  };
}

async function requireUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user.id ?? null;
}

export const Route = createFileRoute("/api/rules")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const userId = await requireUser(request);
        if (!userId) return json({ error: "Not signed in" }, 401);
        const rules = await prisma.rule.findMany({
          where: { userId },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        });
        return json({ rules });
      },

      POST: async ({ request }: { request: Request }) => {
        const userId = await requireUser(request);
        if (!userId) return json({ error: "Not signed in" }, 401);

        const body = (await request.json().catch(() => null)) as
          | (RuleBody & { op?: "create" | "test" })
          | null;
        if (!body) return json({ error: "Invalid body" }, 400);

        let rule;
        try {
          rule = normalize(body);
        } catch (error) {
          return json({ error: (error as Error).message }, 400);
        }

        if (body.op === "test") return preview(request, userId, rule);

        const position = await prisma.rule.count({ where: { userId } });
        const created = await prisma.rule.create({
          data: { ...rule, userId, position },
        });
        return json({ rule: created });
      },

      PATCH: async ({ request }: { request: Request }) => {
        const userId = await requireUser(request);
        if (!userId) return json({ error: "Not signed in" }, 401);

        const body = (await request.json().catch(() => null)) as
          | (RuleBody & { id?: string; enabled?: boolean })
          | null;
        if (!body?.id) return json({ error: "id is required" }, 400);

        // A bare { id, enabled } just toggles; anything else is a full edit.
        const data =
          body.conditions === undefined && body.enabled !== undefined
            ? { enabled: body.enabled }
            : normalizeOrThrow(body);
        if (data instanceof Error) return json({ error: data.message }, 400);

        const { count } = await prisma.rule.updateMany({
          where: { id: body.id, userId },
          data,
        });
        if (count === 0) return json({ error: "Not found" }, 404);
        return json({ ok: true });
      },

      DELETE: async ({ request }: { request: Request }) => {
        const userId = await requireUser(request);
        if (!userId) return json({ error: "Not signed in" }, 401);

        const body = (await request.json().catch(() => null)) as { id?: string } | null;
        if (!body?.id) return json({ error: "id is required" }, 400);

        await prisma.rule.deleteMany({ where: { id: body.id, userId } });
        return json({ ok: true });
      },
    },
  },
});

function normalizeOrThrow(body: RuleBody) {
  try {
    return normalize(body);
  } catch (error) {
    return error as Error;
  }
}

async function preview(
  request: Request,
  userId: string,
  rule: ReturnType<typeof normalize>,
) {
  const accountId = rule.accountIds[0];
  const accessToken = await getGoogleToken(request.headers, userId, accountId);
  if (!accessToken) return json({ error: "No Google access token" }, 403);

  try {
    const matches = await searchEmails(accessToken, ruleToGmailQuery(rule), 8);
    return json({
      matched: matches.length,
      samples: matches.slice(0, 5).map((email) => ({
        from: email.from,
        subject: email.subject,
      })),
    });
  } catch (error) {
    return json({ error: String(error) }, 502);
  }
}
