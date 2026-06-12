import { describe, expect, test } from "bun:test";
import {
  describeActions,
  describeCondition,
  matchesRule,
  ruleHasAction,
  ruleToGmailQuery,
  type Rule,
  type RuleMessage,
} from "@/lib/rules";

const base: Rule = {
  id: "r1",
  accountId: "all",
  name: null,
  enabled: true,
  field: "from",
  operator: "contains",
  value: "@github.com",
  doArchive: false,
  doMarkRead: false,
  doStar: false,
  doTrash: false,
  labelId: null,
  forwardTo: null,
};

const msg = (over: Partial<RuleMessage> = {}): RuleMessage => ({
  from: "GitHub <notifications@github.com>",
  to: "me@example.dev",
  subject: "[scope/api] PR merged",
  hasAttachment: false,
  ...over,
});

describe("matchesRule", () => {
  test("from contains domain", () => {
    expect(matchesRule(base, msg())).toBe(true);
    expect(matchesRule(base, msg({ from: "Vercel <noreply@vercel.app>" }))).toBe(false);
  });

  test("subject contains is case-insensitive", () => {
    const rule = { ...base, field: "subject" as const, value: "pr merged" };
    expect(matchesRule(rule, msg())).toBe(true);
  });

  test("'is' compares the address for from/to, not the display name", () => {
    const rule = {
      ...base,
      field: "to" as const,
      operator: "is" as const,
      value: "alerts@myapp.com",
    };
    expect(matchesRule(rule, msg({ to: "Alerts <alerts@myapp.com>" }))).toBe(true);
    expect(matchesRule(rule, msg({ to: "alerts@other.com" }))).toBe(false);
  });

  test("hasAttachment ignores operator/value", () => {
    const rule = { ...base, field: "hasAttachment" as const };
    expect(matchesRule(rule, msg({ hasAttachment: true }))).toBe(true);
    expect(matchesRule(rule, msg({ hasAttachment: false }))).toBe(false);
  });

  test("empty value never matches", () => {
    expect(matchesRule({ ...base, value: "  " }, msg())).toBe(false);
  });
});

describe("descriptions & guards", () => {
  test("ruleHasAction is false until an action is set", () => {
    expect(ruleHasAction(base)).toBe(false);
    expect(ruleHasAction({ ...base, doArchive: true })).toBe(true);
    expect(ruleHasAction({ ...base, labelId: "Label_1" })).toBe(true);
  });

  test("describeCondition reads as a sentence", () => {
    expect(describeCondition(base)).toBe("From contains @github.com");
    expect(describeCondition({ ...base, field: "hasAttachment" })).toBe(
      "Has an attachment",
    );
  });

  test("ruleToGmailQuery maps fields to Gmail operators", () => {
    expect(ruleToGmailQuery(base)).toBe("from:(@github.com)");
    expect(ruleToGmailQuery({ ...base, field: "subject", value: "x" })).toBe("subject:(x)");
    expect(ruleToGmailQuery({ ...base, field: "hasAttachment" })).toBe("has:attachment");
  });

  test("describeActions lists each action", () => {
    const actions = describeActions(
      { ...base, doStar: true, doArchive: true, forwardTo: "a@b.com", labelId: "L" },
      "dev",
    );
    expect(actions).toEqual([
      'Label "dev"',
      "Star",
      "Archive",
      "Forward to a@b.com",
    ]);
  });
});
