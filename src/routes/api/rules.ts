import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma.server";
import { getGoogleToken } from "@/lib/gmail/accounts.server";
import { searchEmails } from "@/lib/gmail/api.server";
import { json } from "@/lib/json-response";
import { ruleHasAction, ruleToGmailQuery, type RuleField, type RuleOperator } from "@/lib/rules";

const FIELDS: RuleField[] = ["from", "to", "subject", "hasAttachment"];
const OPERATORS: RuleOperator[] = ["contains", "is"];

type RuleInput = {
  accountId?: string;
  name?: string | null;
  field?: RuleField;
  operator?: RuleOperator;
  value?: string;
  doArchive?: boolean;
  doMarkRead?: boolean;
  doStar?: boolean;
  doTrash?: boolean;
  labelId?: string | null;
  forwardTo?: string | null;
};

function normalize(input: RuleInput) {
  if (!input.accountId) throw new Error("accountId is required");
  if (!input.field || !FIELDS.includes(input.field)) throw new Error("invalid field");
  if (!input.operator || !OPERATORS.includes(input.operator)) throw new Error("invalid operator");

  const value = input.field === "hasAttachment" ? "" : (input.value ?? "").trim();
  if (input.field !== "hasAttachment" && !value) throw new Error("value is required");

  const actions = {
    doArchive: Boolean(input.doArchive),
    doMarkRead: Boolean(input.doMarkRead),
    doStar: Boolean(input.doStar),
    doTrash: Boolean(input.doTrash),
    labelId: input.labelId?.trim() || null,
    forwardTo: input.forwardTo?.trim() || null,
  };
  if (!ruleHasAction(actions)) throw new Error("a rule needs at least one action");
  if (actions.labelId && input.accountId === "all") {
    throw new Error("labeling needs a specific account (label ids differ per account)");
  }

  return {
    accountId: input.accountId,
    name: input.name?.trim() || null,
    field: input.field,
    operator: input.operator,
    value,
    ...actions,
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
          orderBy: { createdAt: "asc" },
        });
        return json({ rules });
      },

      POST: async ({ request }: { request: Request }) => {
        const userId = await requireUser(request);
        if (!userId) return json({ error: "Not signed in" }, 401);

        const body = (await request.json().catch(() => null)) as
          | (RuleInput & { op?: "create" | "test" })
          | null;
        if (!body) return json({ error: "Invalid body" }, 400);

        let rule;
        try {
          rule = normalize(body);
        } catch (error) {
          return json({ error: String((error as Error).message) }, 400);
        }

        if (body.op === "test") return preview(request, userId, rule);

        const created = await prisma.rule.create({ data: { ...rule, userId } });
        return json({ rule: created });
      },

      PATCH: async ({ request }: { request: Request }) => {
        const userId = await requireUser(request);
        if (!userId) return json({ error: "Not signed in" }, 401);

        const body = (await request.json().catch(() => null)) as
          | { id?: string; enabled?: boolean }
          | null;
        if (!body?.id) return json({ error: "id is required" }, 400);

        const { count } = await prisma.rule.updateMany({
          where: { id: body.id, userId },
          data: { enabled: body.enabled },
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

async function preview(
  request: Request,
  userId: string,
  rule: ReturnType<typeof normalize>,
) {
  const accountId = rule.accountId === "all" ? undefined : rule.accountId;
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
