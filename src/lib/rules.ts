export type RuleField = "from" | "to" | "subject" | "hasAttachment";
export type RuleOperator = "contains" | "is";

export type Rule = {
  id: string;
  accountId: string;
  name: string | null;
  enabled: boolean;
  field: RuleField;
  operator: RuleOperator;
  value: string;
  doArchive: boolean;
  doMarkRead: boolean;
  doStar: boolean;
  doTrash: boolean;
  labelId: string | null;
  forwardTo: string | null;
};

export type RuleMessage = {
  from: string;
  to: string;
  subject: string;
  hasAttachment: boolean;
};

function address(value: string): string {
  return value.match(/<([^>]+)>/)?.[1]?.trim().toLowerCase() ?? value.trim().toLowerCase();
}

export function matchesRule(rule: Rule, message: RuleMessage): boolean {
  if (rule.field === "hasAttachment") return message.hasAttachment;

  const haystack =
    rule.field === "from"
      ? message.from
      : rule.field === "to"
        ? message.to
        : message.subject;
  const needle = rule.value.trim().toLowerCase();
  if (!needle) return false;

  if (rule.operator === "is") {
    return (rule.field === "subject" ? haystack.trim().toLowerCase() : address(haystack)) === needle;
  }
  return haystack.toLowerCase().includes(needle);
}

export function ruleHasAction(
  rule: Pick<Rule, "doArchive" | "doMarkRead" | "doStar" | "doTrash" | "labelId" | "forwardTo">,
): boolean {
  return (
    rule.doArchive ||
    rule.doMarkRead ||
    rule.doStar ||
    rule.doTrash ||
    Boolean(rule.labelId) ||
    Boolean(rule.forwardTo)
  );
}

// A Gmail search that approximates the condition, for the read-only "what would
// this catch?" preview. The live runner uses matchesRule on message metadata.
export function ruleToGmailQuery(rule: Pick<Rule, "field" | "value">): string {
  switch (rule.field) {
    case "from":
      return `from:(${rule.value})`;
    case "to":
      return `to:(${rule.value})`;
    case "subject":
      return `subject:(${rule.value})`;
    case "hasAttachment":
      return "has:attachment";
  }
}

const FIELD_LABEL: Record<RuleField, string> = {
  from: "From",
  to: "To",
  subject: "Subject",
  hasAttachment: "Has attachment",
};

export function describeCondition(rule: Pick<Rule, "field" | "operator" | "value">): string {
  if (rule.field === "hasAttachment") return "Has an attachment";
  return `${FIELD_LABEL[rule.field]} ${rule.operator} ${rule.value || "…"}`;
}

export function describeActions(
  rule: Pick<Rule, "doArchive" | "doMarkRead" | "doStar" | "doTrash" | "labelId" | "forwardTo">,
  labelName?: string,
): string[] {
  const out: string[] = [];
  if (rule.labelId) out.push(`Label "${labelName ?? "tag"}"`);
  if (rule.doStar) out.push("Star");
  if (rule.doMarkRead) out.push("Mark read");
  if (rule.doArchive) out.push("Archive");
  if (rule.doTrash) out.push("Trash");
  if (rule.forwardTo) out.push(`Forward to ${rule.forwardTo}`);
  return out;
}
