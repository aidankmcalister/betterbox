import type { ThreadRowEmail } from "@/components/thread-row";
import { toFolder, type Folder } from "@/lib/folders";

// Dev-only dummy accounts; panes detect this prefix and render generated mail instead of calling /api/emails.
export const TEST_ACCOUNT_PREFIX = "test-";

export function isTestAccount(accountId: string): boolean {
  return accountId.startsWith(TEST_ACCOUNT_PREFIX);
}

// ── Session-only mutable state for test/demo accounts ──
// Test mail is otherwise regenerated identically on every query, so marking
// read or tagging never "stuck". This tiny in-memory store lets the demo behave
// like a real inbox — no backend, resets on reload.
const testReadIds = new Set<string>();
const testReadAccounts = new Set<string>();
const testEmailLabels = new Map<string, Set<string>>(); // `acct::emailId` -> labelIds
const seededLabelAccounts = new Set<string>();

const labelKey = (accountId: string, emailId: string) =>
  `${accountId}::${emailId}`;

export function isTestEmailRead(accountId: string, emailId: string): boolean {
  return testReadAccounts.has(accountId) || testReadIds.has(emailId);
}

export function markTestEmailsRead(ids: string[]): void {
  for (const id of ids) testReadIds.add(id);
}

export function markTestAccountRead(accountId: string): void {
  testReadAccounts.add(accountId);
}

export function getTestEmailLabelIds(
  accountId: string,
  emailId: string,
): string[] {
  return [...(testEmailLabels.get(labelKey(accountId, emailId)) ?? [])];
}

export function setTestEmailLabel(
  accountId: string,
  emailId: string,
  labelId: string,
  on: boolean,
): void {
  const key = labelKey(accountId, emailId);
  const set = testEmailLabels.get(key) ?? new Set<string>();
  if (on) set.add(labelId);
  else set.delete(labelId);
  if (set.size) testEmailLabels.set(key, set);
  else testEmailLabels.delete(key);
}

export function removeTestLabel(accountId: string, labelId: string): void {
  for (const [key, set] of testEmailLabels) {
    if (key.startsWith(`${accountId}::`)) set.delete(labelId);
  }
}

/** Rows carrying `labelId`, newest first — backs the Labeled view in the demo. */
export function testLabelEmails(
  accountId: string,
  labelId: string,
): ThreadRowEmail[] {
  seedTestLabels(accountId);
  const ids: string[] = [];
  for (const [key, set] of testEmailLabels) {
    if (key.startsWith(`${accountId}::`) && set.has(labelId)) {
      ids.push(key.slice(accountId.length + 2));
    }
  }
  return ids
    .map((id) => testRowById(accountId, id))
    .filter((row): row is ThreadRowEmail => row !== undefined)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function testRowById(
  accountId: string,
  emailId: string,
): ThreadRowEmail | undefined {
  return makeTestEmails(accountId, folderFromId(accountId, emailId)).find(
    (row) => row.id === emailId,
  );
}

/** Pre-tag a handful of inbox messages per account so the Labeled view starts
 *  populated (mirrors the seeded `VIP`/`Receipts`/`Follow up` labels). */
function seedTestLabels(accountId: string): void {
  if (seededLabelAccounts.has(accountId)) return;
  seededLabelAccounts.add(accountId);
  const seed: [number, string][] = [
    [0, "Label_followup"],
    [2, "Label_followup"],
    [1, "Label_vip"],
    [3, "Label_receipts"],
  ];
  for (const [i, labelId] of seed) {
    setTestEmailLabel(accountId, `${accountId}-inbox-${i}`, labelId, true);
  }
}

// ── Drafts authored in the demo composer (create/edit/delete) ──
type TestDraft = {
  id: string;
  accountId: string;
  to: string;
  subject: string;
  html: string;
  date: string;
};
const testDrafts = new Map<string, TestDraft>();
const deletedTestIds = new Set<string>();
let draftCounter = 0;

/** Create or update a demo draft; returns its id. Pass `id` to update in place. */
export function upsertTestDraft(input: {
  id?: string;
  accountId: string;
  to: string;
  subject: string;
  html: string;
}): string {
  const id = input.id ?? `${input.accountId}-drafts-u${draftCounter++}`;
  deletedTestIds.delete(id);
  testDrafts.set(id, {
    id,
    accountId: input.accountId,
    to: input.to,
    subject: input.subject,
    html: input.html,
    date: new Date().toISOString(),
  });
  return id;
}

/** Delete a demo message (draft) so it drops out of every folder listing. */
export function deleteTestEmail(emailId: string): void {
  testDrafts.delete(emailId);
  deletedTestIds.add(emailId);
}

function getTestDraft(emailId: string): TestDraft | undefined {
  return testDrafts.get(emailId);
}

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function testAccountDrafts(accountId: string): ThreadRowEmail[] {
  const seed = Number(accountId.replace(TEST_ACCOUNT_PREFIX, "")) || 1;
  return [...testDrafts.values()]
    .filter((draft) => draft.accountId === accountId)
    .map((draft) => ({
      id: draft.id,
      from: `You <test${seed}@example.dev>`,
      subject: draft.subject || "(no subject)",
      snippet: htmlToText(draft.html),
      date: draft.date,
      unread: false,
      labelIds: [],
    }));
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

/** A deliberately maximal HTML email — used as the first inbox message on the
 *  demo/test accounts so the reader's HTML rendering can be eyeballed end to
 *  end: remote web font + stylesheet, colors, bold/italic/strike/link/code,
 *  lists, blockquote, proxied remote images, a table-based marketing button,
 *  and an over-wide table (to confirm no horizontal scrollbar). */
const FEATURE_TEST = {
  from: "BetterBox <hello@betterbox.dev>",
  subject: "Render test — every feature in one email",
  snippet:
    "Typography, lists, a blockquote, remote images, a web font, colors, a marketing button, and an over-wide table.",
  html: `<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap">
</head><body style="margin:0;background:#f3f4f6;font-family:'Poppins',Arial,sans-serif;color:#1a1a1a;">
<div style="max-width:600px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#f46a3c,#ff885f);padding:32px;text-align:center;">
    <img src="https://picsum.photos/seed/betterbox/120/120" width="84" height="84" alt="avatar" style="border-radius:50%;border:3px solid #fff;display:inline-block;">
    <h1 style="color:#fff;font-size:26px;margin:16px 0 4px;font-weight:700;">BetterBox render test</h1>
    <p style="color:rgba(255,255,255,.9);margin:0;font-size:15px;">If this uses Poppins, the web font loaded.</p>
  </div>
  <div style="background:#fff;padding:28px;">
    <h2 style="color:#f46a3c;font-size:19px;margin:0 0 8px;">Typography</h2>
    <p style="line-height:1.6;margin:0 0 14px;">Plain text with <strong>bold</strong>, <em>italic</em>, <s>strikethrough</s>, <a href="https://betterbox.dev" style="color:#4ea7fc;">a link</a>, and <code style="background:#f1f1f1;padding:2px 5px;border-radius:4px;font-family:monospace;">inline code</code>.</p>
    <p style="color:#27a644;margin:0 0 4px;">This line should be green.</p>
    <p style="color:#eb5757;margin:0 0 14px;">This line should be red.</p>
    <h2 style="color:#f46a3c;font-size:19px;margin:18px 0 8px;">Lists &amp; quote</h2>
    <ul style="line-height:1.6;"><li>Bulleted item one</li><li>Bulleted item two</li></ul>
    <ol style="line-height:1.6;"><li>Numbered one</li><li>Numbered two</li></ol>
    <blockquote style="border-left:3px solid #f46a3c;margin:0 0 14px;padding:8px 16px;color:#666;background:#faf6f4;">A blockquote — indented with a colored bar.</blockquote>
    <h2 style="color:#f46a3c;font-size:19px;margin:18px 0 8px;">Remote image (via proxy)</h2>
    <img src="https://picsum.photos/seed/betterbox-wide/600/220" width="600" alt="wide" style="width:100%;border-radius:8px;display:block;margin:0 0 18px;">
    <h2 style="color:#f46a3c;font-size:19px;margin:0 0 8px;">Marketing button</h2>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 18px;"><tr><td style="background:#f46a3c;border-radius:8px;">
      <a href="https://betterbox.dev" style="display:inline-block;padding:12px 28px;color:#fff;font-weight:600;text-decoration:none;">Open BetterBox &rarr;</a>
    </td></tr></table>
    <h2 style="color:#f46a3c;font-size:19px;margin:0 0 8px;">Over-wide table (no h-scroll?)</h2>
    <table border="1" cellpadding="8" style="border-collapse:collapse;width:760px;font-size:13px;color:#333;">
      <tr style="background:#f8f8f8;"><th>One</th><th>Two</th><th>Three</th><th>Four</th><th>Five</th><th>Six</th></tr>
      <tr><td>alpha</td><td>bravo</td><td>charlie</td><td>delta</td><td>echo</td><td>foxtrot</td></tr>
    </table>
    <p style="color:#999;font-size:12px;margin:24px 0 0;border-top:1px solid #eee;padding-top:12px;">You received this because demo mode is on. <a href="#" style="color:#999;">Unsubscribe</a>.</p>
  </div>
</div>
</body></html>`,
};

function isFeatureTestId(emailId: string): boolean {
  return emailId.endsWith("-inbox-0");
}

export function makeTestFullEmail(accountId: string, emailId: string) {
  // A composer-authored draft resolves from the store, not the seeded set.
  const stored = getTestDraft(emailId);
  if (stored) {
    const seed = Number(accountId.replace(TEST_ACCOUNT_PREFIX, "")) || 1;
    return {
      id: emailId,
      from: `You <test${seed}@example.dev>`,
      to: stored.to,
      subject: stored.subject || "(no subject)",
      date: stored.date,
      messageId: `<${emailId}@example.dev>`,
      threadId: emailId,
      references: "",
      starred: false,
      snippet: htmlToText(stored.html),
      unread: false,
      labelIds: [],
      body: "",
      bodyHtml: stored.html,
    };
  }

  const folder = folderFromId(accountId, emailId);
  const row = makeTestEmails(accountId, folder).find(
    (email) => email.id === emailId,
  );
  const index = Number(accountId.replace(TEST_ACCOUNT_PREFIX, "")) || 1;
  const feature = isFeatureTestId(emailId);
  // Drafts open in the composer — give them just their own text (no reader
  // boilerplate) and an empty recipient to fill in.
  const isDraft = folder === "drafts";
  return {
    id: emailId,
    from: feature
      ? FEATURE_TEST.from
      : (row?.from ?? "Test <test@example.dev>"),
    to: isDraft ? "" : `test${index}@example.dev`,
    subject: feature ? FEATURE_TEST.subject : (row?.subject ?? "(no subject)"),
    date: row?.date ?? "",
    messageId: `<${emailId}@example.dev>`,
    threadId: emailId,
    references: "",
    starred: false,
    snippet: feature ? FEATURE_TEST.snippet : row?.snippet,
    unread: row?.unread ?? false,
    labelIds: getTestEmailLabelIds(accountId, emailId),
    body: isDraft
      ? (row?.snippet ?? "")
      : `${row?.snippet ?? ""}\n\nThis is a generated message on a dev test account — there is no real mail behind it. Use it to exercise the reader pane: drag its header to dock it elsewhere, resize the seams, and toggle technical metadata in Settings → Developer.`,
    bodyHtml: feature ? FEATURE_TEST.html : undefined,
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
  [
    "You",
    "Re: PR #214 merged",
    "Thanks — deploying now, will confirm once live.",
  ],
  ["You", "Re: Invoice #A1B2-0042", "Paid, receipt attached. Appreciate it!"],
  [
    "You",
    "Spec feedback",
    "Left comments on the component spec — mostly nits.",
  ],
  ["You", "Re: 3 issues assigned", "Picking up SCO-118 first, rest by Friday."],
  ["You", "Quota follow-up", "Bumped the daily quota, should hold us for now."],
];

const DRAFTS: readonly Mail[] = [
  [
    "You",
    "Re: parser AST question",
    "Yes — exposeAst() lands next minor, here’s…",
  ],
  ["You", "Launch checklist", "1. flip demo mode  2. record  3. ship the cut"],
  ["You", "(no subject)", ""],
];

const SPAM: readonly Mail[] = [
  [
    "Winner Notice",
    "You’ve been selected!!!",
    "Claim your $1,000 reward — act fast",
  ],
  [
    "Crypto Signals",
    "10x your portfolio today",
    "Limited VIP trading spots left",
  ],
  [
    "Pharma Deals",
    "Save 90% on meds",
    "No prescription needed, discreet shipping",
  ],
  [
    "Account Team",
    "Verify your account",
    "Unusual activity detected, confirm here",
  ],
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
  seedTestLabels(accountId);
  const seed = Number(accountId.replace(TEST_ACCOUNT_PREFIX, "")) || 1;
  const now = Date.now();
  const { mail, count: baseCount, self, allRead } = FOLDER_MAIL[folder];

  // Seed-derived spread keeps each account distinct without cloning; capped so high-volume folders stay full.
  const spread = Math.min(20, Math.max(1, Math.round(baseCount * 0.2)));
  const count = Math.max(self ? 2 : 3, baseCount - ((seed * 7) % (spread + 1)));

  let minutesAgo = (seed * 11) % 23;
  const rows = Array.from({ length: count }, (_, i) => {
    // Non-uniform gaps keyed off account + index so timestamps don't align row-for-row between panes.
    minutesAgo += 28 + ((seed * 17 + i * 13) % 53);
    // First inbox row is the maximal HTML render-test email.
    const feature = folder === "inbox" && i === 0;
    const [name, subject, snippet] = feature
      ? [FEATURE_TEST.from, FEATURE_TEST.subject, FEATURE_TEST.snippet]
      : mail[(seed * 5 + i) % mail.length];
    const from = feature
      ? FEATURE_TEST.from
      : self
        ? `You <test${seed}@example.dev>`
        : `${name} <noreply@${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com>`;
    const id = `${accountId}-${folder}-${i}`;
    const seedUnread = feature
      ? true
      : allRead
        ? false
        : (seed * 3 + i) % 4 === 0;
    return {
      id,
      from,
      subject,
      snippet,
      date: new Date(now - minutesAgo * 60_000).toISOString(),
      unread: isTestEmailRead(accountId, id) ? false : seedUnread,
      labelIds: getTestEmailLabelIds(accountId, id),
    };
  });

  // Merge composer-authored drafts ahead of the seeded ones, and drop anything
  // the user deleted, so the demo's Drafts folder reflects their edits.
  const merged =
    folder === "drafts" ? [...testAccountDrafts(accountId), ...rows] : rows;
  return merged
    .filter((row) => !deletedTestIds.has(row.id))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
