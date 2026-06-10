import type { ThreadRowEmail } from "@/components/thread-row";

/**
 * Dev-only dummy accounts for exercising the multi-account tiles without
 * linking real Gmail accounts. Panes detect the prefix and render generated
 * mail instead of calling /api/emails.
 */
export const TEST_ACCOUNT_PREFIX = "test-";

export function isTestAccount(accountId: string): boolean {
  return accountId.startsWith(TEST_ACCOUNT_PREFIX);
}

export function makeTestAccount(index: number) {
  return {
    accountId: `${TEST_ACCOUNT_PREFIX}${index}`,
    email: `test${index}@example.dev`,
    unread: (index * 137) % 1900 + 12,
  };
}

const SENDERS = [
  ["GitHub", "[scope/api] PR #214 merged", "fix: debounce token refresh on 401"],
  ["Vercel", "Deployment ready", "better-mail-2 deployed to production in 34s"],
  ["Stripe", "Your invoice is available", "Invoice #A1B2-0042 for $20.00 is ready"],
  ["Dependabot", "Bump vite from 6.0.1 to 6.0.4", "CI passed on all 9 checks"],
  ["npm", "ratchet@2.4.1 published", "Published to the npm registry"],
  ["Linear", "3 issues assigned to you", "SCO-114, SCO-118, SCO-121 moved to In Progress"],
  ["Discord", "2 new mentions in #dev", "@aidan: does the parser expose the AST?"],
  ["Google Cloud", "Quota warning", "gmail.googleapis.com at 78% of daily quota"],
  ["AWS", "Your bill is available", "Estimated charges for June: $4.87"],
  ["Figma", "Comments on Better Mail", "2 new comments on Component Spec"],
] as const;

/** Full message for the reader pane, synthesized from the row data. */
export function makeTestFullEmail(accountId: string, emailId: string) {
  const row = makeTestEmails(accountId).find((email) => email.id === emailId);
  const index = Number(accountId.replace(TEST_ACCOUNT_PREFIX, "")) || 1;
  return {
    id: emailId,
    from: row?.from ?? "Test <test@example.dev>",
    to: `test${index}@example.dev`,
    subject: row?.subject ?? "(no subject)",
    date: row?.date ?? "",
    messageId: `<${emailId}@example.dev>`,
    snippet: row?.snippet,
    unread: row?.unread ?? false,
    body: `${row?.snippet ?? ""}\n\nThis is a generated message on a dev test account — there is no real mail behind it. Use it to exercise the reader pane: drag its header to dock it elsewhere, resize the seams, and toggle technical metadata in Settings → Developer.`,
  };
}

export function makeTestEmails(accountId: string): ThreadRowEmail[] {
  const seed = Number(accountId.replace(TEST_ACCOUNT_PREFIX, "")) || 1;
  const now = Date.now();
  return Array.from({ length: 30 }, (_, i) => {
    const [name, subject, snippet] = SENDERS[(seed + i) % SENDERS.length];
    return {
      id: `${accountId}-${i}`,
      from: `${name} <noreply@${name.toLowerCase().replace(/ /g, "")}.com>`,
      subject: `${subject}`,
      snippet,
      date: new Date(now - i * 47 * 60_000 - seed * 9 * 60_000).toISOString(),
      unread: (seed + i) % 4 === 0,
    };
  });
}
