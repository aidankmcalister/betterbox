import { describe, expect, test } from "bun:test";
import {
  isTestAccount,
  makeDemoAccounts,
  makeTestAccount,
  makeTestEmails,
  makeTestFullEmail,
  testInboxUnread,
} from "@/lib/test-account";

describe("inbox volume", () => {
  test("inbox always has at least 100 rows", () => {
    expect(makeTestEmails("test-1", "inbox").length).toBeGreaterThanOrEqual(
      100,
    );
    expect(makeTestEmails("test-2", "inbox").length).toBeGreaterThanOrEqual(
      100,
    );
  });

  test("two accounts differ in volume (not cloned)", () => {
    expect(makeTestEmails("test-1", "inbox").length).not.toBe(
      makeTestEmails("test-2", "inbox").length,
    );
  });
});

describe("folder-aware mail", () => {
  test("row ids encode their folder", () => {
    expect(makeTestEmails("test-1", "sent")[0].id).toBe("test-1-sent-0");
    expect(makeTestEmails("test-1", "trash")[0].id).toBe("test-1-trash-0");
  });

  test("sent and drafts come from 'You'", () => {
    expect(makeTestEmails("test-1", "sent")[0].from).toContain("You");
    expect(makeTestEmails("test-1", "drafts")[0].from).toContain("You");
  });

  test("folders are distinct, not echoes of the inbox", () => {
    const inbox = makeTestEmails("test-1", "inbox")[0];
    const sent = makeTestEmails("test-1", "sent")[0];
    expect(inbox.subject).not.toBe(sent.subject);
  });

  test("reader recovers the folder from the id", () => {
    const sent = makeTestEmails("test-1", "sent");
    const full = makeTestFullEmail("test-1", sent[0].id);
    expect(full.subject).toBe(sent[0].subject);
    expect(full.from).toContain("You");
  });
});

describe("account badges", () => {
  test("the 'N new' badge matches the unread dots in the inbox", () => {
    const dots = makeTestEmails("test-1", "inbox").filter(
      (email) => email.unread,
    ).length;
    expect(testInboxUnread("test-1")).toBe(dots);
    expect(makeTestAccount(1).unread).toBe(dots);
  });

  test("demo accounts use friendly emails and differ from each other", () => {
    const [a, b] = makeDemoAccounts();
    expect(a.email).toBe("personal@example.com");
    expect(b.email).toBe("work@example.com");
    expect(a.unread).not.toBe(b.unread);
  });

  test("isTestAccount only matches the test- prefix", () => {
    expect(isTestAccount("test-1")).toBe(true);
    expect(isTestAccount("103873875507597239196")).toBe(false);
  });
});
