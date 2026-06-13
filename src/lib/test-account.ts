import type { ThreadRowEmail } from "@/components/thread-row";
import { toFolder, type Folder } from "@/lib/folders";
// Demo mail content lives in JSON to keep this module focused on logic.
import demoMail from "@/data/demo-mail.json";

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
    { ...makeTestAccount(1), email: "personal@example.com" },
    { ...makeTestAccount(2), email: "work@example.com" },
  ];
}

/** A deliberately maximal HTML email shown as the first inbox message on the
 *  demo/test accounts so the reader's HTML rendering can be eyeballed end to
 *  end. Content (and the other demo mail below) lives in `@/data/demo-mail`. */
const FEATURE_TEST = demoMail.featureTest;

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

const FOLDER_MAIL: Record<
  Folder,
  { mail: readonly Mail[]; count: number; self?: boolean; allRead?: boolean }
> = {
  inbox: { mail: demoMail.senders as unknown as Mail[], count: 120 },
  labeled: { mail: demoMail.senders as unknown as Mail[], count: 8 }, // accordion view; entry satisfies Record<Folder> shape
  archived: {
    mail: demoMail.archived as unknown as Mail[],
    count: 16,
    allRead: true,
  },
  sent: {
    mail: demoMail.sent as unknown as Mail[],
    count: 12,
    self: true,
    allRead: true,
  },
  drafts: {
    mail: demoMail.drafts as unknown as Mail[],
    count: 3,
    self: true,
    allRead: true,
  },
  spam: { mail: demoMail.spam as unknown as Mail[], count: 7 },
  trash: { mail: demoMail.trash as unknown as Mail[], count: 8, allRead: true },
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
