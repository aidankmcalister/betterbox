import { describe, expect, test } from "bun:test";
import {
  describeRule,
  isRuleValid,
  matchesRule,
  ruleToGmailQuery,
  type Condition,
  type RuleMessage,
} from "@/lib/rules";

const from = (value: string): Condition => ({ field: "from", operator: "contains", value });
const subject = (value: string): Condition => ({
  field: "subject",
  operator: "contains",
  value,
});

const msg = (over: Partial<RuleMessage> = {}): RuleMessage => ({
  from: "GitHub <notifications@github.com>",
  to: "me@example.dev",
  subject: "[CRITICAL] api down",
  hasAttachment: false,
  ...over,
});

describe("matchesRule", () => {
  test("AND requires every condition", () => {
    const rule = { match: "all" as const, conditions: [from("@github.com"), subject("api")] };
    expect(matchesRule(rule, msg())).toBe(true);
    expect(matchesRule(rule, msg({ subject: "hello" }))).toBe(false);
  });

  test("OR requires any condition", () => {
    const rule = {
      match: "any" as const,
      conditions: [subject("[CRITICAL]"), subject("[SEV1]")],
    };
    expect(matchesRule(rule, msg())).toBe(true);
    expect(matchesRule(rule, msg({ subject: "[SEV1] db" }))).toBe(true);
    expect(matchesRule(rule, msg({ subject: "all good" }))).toBe(false);
  });

  test("hasAttachment compares the boolean value", () => {
    const rule = {
      match: "all" as const,
      conditions: [{ field: "hasAttachment" as const, operator: "is" as const, value: "false" }],
    };
    expect(matchesRule(rule, msg({ hasAttachment: false }))).toBe(true);
    expect(matchesRule(rule, msg({ hasAttachment: true }))).toBe(false);
  });

  test("'is' compares the from/to address, not the display name", () => {
    const rule = {
      match: "all" as const,
      conditions: [{ field: "to" as const, operator: "is" as const, value: "alerts@myapp.com" }],
    };
    expect(matchesRule(rule, msg({ to: "Alerts <alerts@myapp.com>" }))).toBe(true);
    expect(matchesRule(rule, msg({ to: "alerts@other.com" }))).toBe(false);
  });

  test("no conditions never matches", () => {
    expect(matchesRule({ match: "all", conditions: [] }, msg())).toBe(false);
  });
});

describe("validation, description, query", () => {
  test("isRuleValid needs a complete condition and a complete action", () => {
    expect(isRuleValid({ conditions: [from("@x.com")], actions: [{ type: "archive" }] })).toBe(true);
    expect(isRuleValid({ conditions: [], actions: [{ type: "archive" }] })).toBe(false);
    expect(isRuleValid({ conditions: [from("@x.com")], actions: [] })).toBe(false);
    expect(isRuleValid({ conditions: [from("@x.com")], actions: [{ type: "label" }] })).toBe(false);
    expect(
      isRuleValid({ conditions: [from("@x.com")], actions: [{ type: "label", value: "dev" }] }),
    ).toBe(true);
  });

  test("describeRule reads like the table summary", () => {
    expect(
      describeRule({
        match: "all",
        conditions: [from("@github.com")],
        actions: [{ type: "archive" }, { type: "label", value: "dev" }],
      }),
    ).toBe("from contains “@github.com” → archive + apply label “dev”");
  });

  test("ruleToGmailQuery joins OR conditions in a Gmail group", () => {
    expect(ruleToGmailQuery({ match: "all", conditions: [from("@x.com")] })).toBe("from:(@x.com)");
    expect(
      ruleToGmailQuery({ match: "any", conditions: [subject("a"), subject("b")] }),
    ).toBe("{subject:(a) subject:(b)}");
    expect(
      ruleToGmailQuery({
        match: "all",
        conditions: [from("@x.com"), { field: "hasAttachment", operator: "is", value: "false" }],
      }),
    ).toBe("from:(@x.com) -has:attachment");
  });
});
