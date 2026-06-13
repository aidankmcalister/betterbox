export type ConditionField =
  | "from"
  | "to"
  | "subject"
  | "body"
  | "hasAttachment"
  | "label";
export type Operator =
  | "contains"
  | "notContains"
  | "is"
  | "isNot"
  | "startsWith"
  | "endsWith";
export type MatchMode = "all" | "any";
export type ActionType =
  | "label"
  | "archive"
  | "trash"
  | "star"
  | "markRead"
  | "forward"
  | "webhook";

export type Condition = {
  field: ConditionField;
  operator: Operator;
  value: string;
};

export type Action = {
  type: ActionType;
  value?: string;
};

export type Rule = {
  id: string;
  name: string | null;
  enabled: boolean;
  position: number;
  accountIds: string[];
  match: MatchMode;
  conditions: Condition[];
  actions: Action[];
  applyToExisting: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
};

export type RuleMessage = {
  from: string;
  to: string;
  subject: string;
  body?: string;
  hasAttachment: boolean;
  labelIds?: string[];
  labelNames?: string[];
};

function address(value: string): string {
  return (
    value
      .match(/<([^>]+)>/)?.[1]
      ?.trim()
      .toLowerCase() ?? value.trim().toLowerCase()
  );
}

export function matchesCondition(
  condition: Condition,
  message: RuleMessage,
): boolean {
  if (condition.field === "hasAttachment") {
    return message.hasAttachment === (condition.value !== "false");
  }
  if (condition.field === "label") {
    const needle = condition.value.trim().toLowerCase();
    if (!needle) return false;
    const labels = [
      ...(message.labelIds ?? []),
      ...(message.labelNames ?? []),
    ].map((label) => label.toLowerCase());
    const hasLabel = labels.includes(needle);
    return condition.operator === "isNot" ? !hasLabel : hasLabel;
  }
  const isText = condition.field === "subject" || condition.field === "body";
  const haystack =
    condition.field === "from"
      ? message.from
      : condition.field === "to"
        ? message.to
        : condition.field === "body"
          ? (message.body ?? "")
          : message.subject;
  const needle = condition.value.trim().toLowerCase();
  if (!needle) return false;
  const normalizedHaystack = isText
    ? haystack.trim().toLowerCase()
    : address(haystack);

  if (condition.operator === "is") {
    return normalizedHaystack === needle;
  }
  if (condition.operator === "isNot") {
    return normalizedHaystack !== needle;
  }
  if (condition.operator === "startsWith") {
    return normalizedHaystack.startsWith(needle);
  }
  if (condition.operator === "endsWith") {
    return normalizedHaystack.endsWith(needle);
  }
  if (condition.operator === "notContains") {
    return !haystack.toLowerCase().includes(needle);
  }
  return haystack.toLowerCase().includes(needle);
}

export function matchesRule(
  rule: Pick<Rule, "match" | "conditions">,
  message: RuleMessage,
): boolean {
  if (rule.conditions.length === 0) return false;
  const test = (condition: Condition) => matchesCondition(condition, message);
  return rule.match === "any"
    ? rule.conditions.some(test)
    : rule.conditions.every(test);
}

export function isConditionComplete(condition: Condition): boolean {
  return (
    condition.field === "hasAttachment" || condition.value.trim().length > 0
  );
}

export function isActionComplete(action: Action): boolean {
  const needsValue: ActionType[] = ["label", "forward", "webhook"];
  return !needsValue.includes(action.type) || Boolean(action.value?.trim());
}

export function isRuleValid(
  rule: Pick<Rule, "conditions" | "actions">,
): boolean {
  return (
    rule.conditions.length > 0 &&
    rule.conditions.every(isConditionComplete) &&
    rule.actions.length > 0 &&
    rule.actions.every(isActionComplete)
  );
}

const FIELD_LABEL: Record<ConditionField, string> = {
  from: "from",
  to: "to",
  subject: "subject",
  body: "body",
  hasAttachment: "has attachment",
  label: "label",
};

const OPERATOR_LABEL: Record<Operator, string> = {
  contains: "contains",
  notContains: "does not contain",
  is: "is exactly",
  isNot: "is not",
  startsWith: "starts with",
  endsWith: "ends with",
};

export function describeCondition(condition: Condition): string {
  if (condition.field === "hasAttachment") {
    return condition.value === "false"
      ? "has no attachment"
      : "has an attachment";
  }
  return `${FIELD_LABEL[condition.field]} ${OPERATOR_LABEL[condition.operator]} “${condition.value}”`;
}

export function describeConditions(
  rule: Pick<Rule, "match" | "conditions">,
): string {
  return rule.conditions
    .map(describeCondition)
    .join(rule.match === "any" ? " OR " : " AND ");
}

export function describeAction(action: Action): string {
  switch (action.type) {
    case "label":
      return `apply label “${action.value ?? ""}”`;
    case "archive":
      return "archive";
    case "trash":
      return "trash";
    case "star":
      return "star";
    case "markRead":
      return "mark as read";
    case "forward":
      return `forward to ${action.value ?? ""}`;
    case "webhook":
      return `trigger webhook “${action.value ?? ""}”`;
  }
}

export function describeActions(rule: Pick<Rule, "actions">): string {
  return rule.actions.map(describeAction).join(" + ");
}

export function describeRule(
  rule: Pick<Rule, "match" | "conditions" | "actions">,
): string {
  return `${describeConditions(rule)} → ${describeActions(rule)}`;
}

// A Gmail search that approximates the conditions, for the read-only "what would
// this catch?" preview. The live runner uses matchesRule on message metadata.
function conditionToGmailTerm(condition: Condition): string {
  const negative =
    condition.operator === "notContains" || condition.operator === "isNot";
  switch (condition.field) {
    case "from":
      return `${negative ? "-" : ""}from:(${condition.value})`;
    case "to":
      return `${negative ? "-" : ""}to:(${condition.value})`;
    case "subject":
      return `${negative ? "-" : ""}subject:(${condition.value})`;
    case "body":
      return `${negative ? "-" : ""}(${condition.value})`;
    case "hasAttachment":
      return condition.value === "false" ? "-has:attachment" : "has:attachment";
    case "label":
      return condition.operator === "isNot"
        ? `-label:"${condition.value}"`
        : `label:"${condition.value}"`;
  }
}

export function ruleToGmailQuery(
  rule: Pick<Rule, "match" | "conditions">,
): string {
  const terms = rule.conditions.map(conditionToGmailTerm);
  if (terms.length <= 1) return terms[0] ?? "";
  return rule.match === "any" ? `{${terms.join(" ")}}` : terms.join(" ");
}
