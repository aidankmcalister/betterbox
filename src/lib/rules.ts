export type ConditionField = "from" | "to" | "subject" | "hasAttachment";
export type Operator = "contains" | "is";
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
  hasAttachment: boolean;
};

function address(value: string): string {
  return value.match(/<([^>]+)>/)?.[1]?.trim().toLowerCase() ?? value.trim().toLowerCase();
}

export function matchesCondition(condition: Condition, message: RuleMessage): boolean {
  if (condition.field === "hasAttachment") {
    return message.hasAttachment === (condition.value !== "false");
  }
  const haystack =
    condition.field === "from"
      ? message.from
      : condition.field === "to"
        ? message.to
        : message.subject;
  const needle = condition.value.trim().toLowerCase();
  if (!needle) return false;

  if (condition.operator === "is") {
    return (
      (condition.field === "subject" ? haystack.trim().toLowerCase() : address(haystack)) ===
      needle
    );
  }
  return haystack.toLowerCase().includes(needle);
}

export function matchesRule(rule: Pick<Rule, "match" | "conditions">, message: RuleMessage): boolean {
  if (rule.conditions.length === 0) return false;
  const test = (condition: Condition) => matchesCondition(condition, message);
  return rule.match === "any" ? rule.conditions.some(test) : rule.conditions.every(test);
}

export function isConditionComplete(condition: Condition): boolean {
  return condition.field === "hasAttachment" || condition.value.trim().length > 0;
}

export function isActionComplete(action: Action): boolean {
  const needsValue: ActionType[] = ["label", "forward", "webhook"];
  return !needsValue.includes(action.type) || Boolean(action.value?.trim());
}

export function isRuleValid(rule: Pick<Rule, "conditions" | "actions">): boolean {
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
  hasAttachment: "has attachment",
};

export function describeCondition(condition: Condition): string {
  if (condition.field === "hasAttachment") {
    return `has attachment is ${condition.value === "false" ? "false" : "true"}`;
  }
  return `${FIELD_LABEL[condition.field]} ${condition.operator} “${condition.value}”`;
}

export function describeConditions(rule: Pick<Rule, "match" | "conditions">): string {
  return rule.conditions.map(describeCondition).join(rule.match === "any" ? " OR " : " AND ");
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

export function describeRule(rule: Pick<Rule, "match" | "conditions" | "actions">): string {
  return `${describeConditions(rule)} → ${describeActions(rule)}`;
}

// A Gmail search that approximates the conditions, for the read-only "what would
// this catch?" preview. The live runner uses matchesRule on message metadata.
function conditionToGmailTerm(condition: Condition): string {
  switch (condition.field) {
    case "from":
      return `from:(${condition.value})`;
    case "to":
      return `to:(${condition.value})`;
    case "subject":
      return `subject:(${condition.value})`;
    case "hasAttachment":
      return condition.value === "false" ? "-has:attachment" : "has:attachment";
  }
}

export function ruleToGmailQuery(rule: Pick<Rule, "match" | "conditions">): string {
  const terms = rule.conditions.map(conditionToGmailTerm);
  if (terms.length <= 1) return terms[0] ?? "";
  return rule.match === "any" ? `{${terms.join(" ")}}` : terms.join(" ");
}
