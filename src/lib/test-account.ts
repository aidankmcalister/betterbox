import type { ThreadRowEmail } from "@/components/thread-row";
import { toFolder, type Folder } from "@/lib/folders";

// Dev-only dummy accounts; panes detect this prefix and render generated mail instead of calling /api/emails.
export const TEST_ACCOUNT_PREFIX = "test-";

export function isTestAccount(accountId: string): boolean {
  return accountId.startsWith(TEST_ACCOUNT_PREFIX);
}

export function makeTestAccount(index: number) {
  const accountId = `${TEST_ACCOUNT_PREFIX}${index}`;
  return {
    accountId,
    email: `test${index}@example.dev`,
    unread: testInboxUnread(accountId),
  };
}

export function testInboxUnread(accountId: string): number {
  return makeTestEmails(accountId, "inbox").filter((email) => email.unread)
    .length;
}

// Demo mode replaces real Gmail accounts with these so nothing private appears on screen while recording.
export function makeDemoAccounts() {
  return [
    { ...makeTestAccount(1), email: "personal@betterbox.dev" },
    { ...makeTestAccount(2), email: "work@betterbox.dev" },
  ];
}

const SENDERS = [
  [
    "GitHub",
    "[scope/api] PR #214 merged",
    "fix: debounce token refresh on 401",
  ],
  ["Vercel", "Deployment ready", "betterbox deployed to production in 34s"],
  [
    "Stripe",
    "Your invoice is available",
    "Invoice #A1B2-0042 for $20.00 is ready",
  ],
  ["Dependabot", "Bump vite from 6.0.1 to 6.0.4", "CI passed on all 9 checks"],
  ["npm", "ratchet@2.4.1 published", "Published to the npm registry"],
  [
    "Linear",
    "3 issues assigned to you",
    "SCO-114, SCO-118, SCO-121 moved to In Progress",
  ],
  [
    "Discord",
    "2 new mentions in #dev",
    "@aidan: does the parser expose the AST?",
  ],
  [
    "Google Cloud",
    "Quota warning",
    "gmail.googleapis.com at 78% of daily quota",
  ],
  ["AWS", "Your bill is available", "Estimated charges for June: $4.87"],
  ["Figma", "Comments on BetterBox", "2 new comments on Component Spec"],
] as const;

export function makeTestFullEmail(accountId: string, emailId: string) {
  const row = makeTestEmails(accountId, folderFromId(accountId, emailId)).find(
    (email) => email.id === emailId,
  );
  const index = Number(accountId.replace(TEST_ACCOUNT_PREFIX, "")) || 1;
  return {
    id: emailId,
    from: row?.from ?? "Test <test@example.dev>",
    to: `test${index}@example.dev`,
    subject: row?.subject ?? "(no subject)",
    date: row?.date ?? "",
    messageId: `<${emailId}@example.dev>`,
    threadId: emailId,
    references: "",
    starred: false,
    snippet: row?.snippet,
    unread: row?.unread ?? false,
    body: `${row?.snippet ?? ""}\n\nThis is a generated message on a dev test account — there is no real mail behind it. Use it to exercise the reader pane: drag its header to dock it elsewhere, resize the seams, and toggle technical metadata in Settings → Developer.`,
  };
}

export function makeTestRawEmail(accountId: string, emailId: string): string {
  const email = makeTestFullEmail(accountId, emailId);
  return [
    `Delivered-To: ${email.to}`,
    `Message-ID: ${email.messageId}`,
    `Date: ${email.date}`,
    `From: ${email.from}`,
    `To: ${email.to}`,
    `Subject: ${email.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    email.body,
  ].join("\n");
}

type Mail = readonly [name: string, subject: string, snippet: string];

const ARCHIVED: readonly Mail[] = [
  ["Notion", "Your weekly digest", "12 pages updated across 3 teamspaces"],
  ["Calendly", "Event scheduled", "Intro call confirmed for Thursday 2:00 PM"],
  ["Cloudflare", "Weekly analytics", "1.2M requests served · 0 origin errors"],
  ["1Password", "Watchtower report", "No compromised logins this week"],
  ["Raycast", "What’s new in 1.80", "AI commands, window tiling, and more"],
  ["Postmark", "Sending report", "8,402 emails delivered · 99.8% delivery"],
];

const SENT: readonly Mail[] = [
  ["You", "Re: PR #214 merged", "Thanks — deploying now, will confirm once live."],
  ["You", "Re: Invoice #A1B2-0042", "Paid, receipt attached. Appreciate it!"],
  ["You", "Spec feedback", "Left comments on the component spec — mostly nits."],
  ["You", "Re: 3 issues assigned", "Picking up SCO-118 first, rest by Friday."],
  ["You", "Quota follow-up", "Bumped the daily quota, should hold us for now."],
];

const DRAFTS: readonly Mail[] = [
  ["You", "Re: parser AST question", "Yes — exposeAst() lands next minor, here’s…"],
  ["You", "Launch checklist", "1. flip demo mode  2. record  3. ship the cut"],
  ["You", "(no subject)", ""],
];

const SPAM: readonly Mail[] = [
  ["Winner Notice", "You’ve been selected!!!", "Claim your $1,000 reward — act fast"],
  ["Crypto Signals", "10x your portfolio today", "Limited VIP trading spots left"],
  ["Pharma Deals", "Save 90% on meds", "No prescription needed, discreet shipping"],
  ["Account Team", "Verify your account", "Unusual activity detected, confirm here"],
];

const TRASH: readonly Mail[] = [
  ["Old Newsletter", "Weekly roundup #88", "You unsubscribed from this list"],
  ["Calendar", "Event canceled", "Standup on Monday was removed"],
  ["GitHub", "[scope/api] PR #201 closed", "Closed without merging"],
  ["Receipts", "Refund processed", "$12.00 refunded to your card"],
];

const FOLDER_MAIL: Record<
  Folder,
  { mail: readonly Mail[]; count: number; self?: boolean; allRead?: boolean }
> = {
  inbox: { mail: SENDERS, count: 120 },
  labeled: { mail: SENDERS, count: 8 }, // accordion view; entry satisfies Record<Folder> shape
  archived: { mail: ARCHIVED, count: 16, allRead: true },
  sent: { mail: SENT, count: 12, self: true, allRead: true },
  drafts: { mail: DRAFTS, count: 3, self: true, allRead: true },
  spam: { mail: SPAM, count: 7 },
  trash: { mail: TRASH, count: 8, allRead: true },
};

function folderFromId(accountId: string, emailId: string): Folder {
  const rest = emailId.startsWith(`${accountId}-`)
    ? emailId.slice(accountId.length + 1)
    : emailId;
  return toFolder(rest.split("-")[0]);
}

export function makeTestEmails(
  accountId: string,
  folder: Folder = "inbox",
): ThreadRowEmail[] {
  const seed = Number(accountId.replace(TEST_ACCOUNT_PREFIX, "")) || 1;
  const now = Date.now();
  const { mail, count: baseCount, self, allRead } = FOLDER_MAIL[folder];

  // Seed-derived spread keeps each account distinct without cloning; capped so high-volume folders stay full.
  const spread = Math.min(20, Math.max(1, Math.round(baseCount * 0.2)));
  const count = Math.max(self ? 2 : 3, baseCount - ((seed * 7) % (spread + 1)));

  let minutesAgo = (seed * 11) % 23;
  return Array.from({ length: count }, (_, i) => {
    // Non-uniform gaps keyed off account + index so timestamps don't align row-for-row between panes.
    minutesAgo += 28 + ((seed * 17 + i * 13) % 53);
    const [name, subject, snippet] = mail[(seed * 5 + i) % mail.length];
    const from = self
      ? `You <test${seed}@example.dev>`
      : `${name} <noreply@${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com>`;
    return {
      id: `${accountId}-${folder}-${i}`,
      from,
      subject,
      snippet,
      date: new Date(now - minutesAgo * 60_000).toISOString(),
      unread: allRead ? false : (seed * 3 + i) % 4 === 0,
    };
  });
}
