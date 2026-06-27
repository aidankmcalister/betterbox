import type { ThreadRowEmail } from "@/components/thread-row";
import { toFolder, type Folder } from "@/lib/folders";
import demoMail from "@/data/demo-mail.json";

// Dev-only dummy accounts; panes detect this prefix and render generated mail instead of calling /api/emails.
export const TEST_ACCOUNT_PREFIX = "test-";

export function isTestAccount(accountId: string): boolean {
  return accountId.startsWith(TEST_ACCOUNT_PREFIX);
}

// Test mail regenerates identically per query, so read/tag state wouldn't stick.
// This in-memory store gives the demo real-inbox behavior; resets on reload.
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

/** Pre-tag a few inbox messages per account so the Labeled view starts populated
 *  (mirrors the seeded `VIP`/`Receipts`/`Follow up` labels). */
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
  return [...testDrafts.values()]
    .filter((draft) => draft.accountId === accountId)
    .map((draft) => ({
      id: draft.id,
      from: `You <${testAccountEmail(accountId)}>`,
      subject: draft.subject || "(no subject)",
      snippet: htmlToText(draft.html),
      date: draft.date,
      unread: false,
      labelIds: [],
    }));
}

/** Friendly per-account address for the demo/reader, so recordings never surface
 *  a `test-N@example.dev` artifact. Generic alias beyond the seeded demo pair. */
const DEMO_EMAIL_BY_INDEX: Record<number, string> = {
  1: "personal@example.com",
  2: "work@example.com",
};

function testAccountEmail(accountId: string): string {
  const index = Number(accountId.replace(TEST_ACCOUNT_PREFIX, "")) || 1;
  return DEMO_EMAIL_BY_INDEX[index] ?? `you+${index}@example.com`;
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
    { ...makeTestAccount(1), email: testAccountEmail("test-1") },
    { ...makeTestAccount(2), email: testAccountEmail("test-2") },
  ];
}

export function makeTestFullEmail(accountId: string, emailId: string) {
  // A composer-authored draft resolves from the store, not the seeded set.
  const stored = getTestDraft(emailId);
  if (stored) {
    return {
      id: emailId,
      from: `You <${testAccountEmail(accountId)}>`,
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
  // Drafts open in the composer: just their own text + empty recipient. Others
  // render the message body (4th demo-mail field), falling back to snippet.
  const isDraft = folder === "drafts";
  const body = testMailEntry(accountId, emailId)?.[3] ?? row?.snippet ?? "";
  return {
    id: emailId,
    from: row?.from ?? "Test <test@example.dev>",
    to: isDraft ? "" : testAccountEmail(accountId),
    subject: row?.subject ?? "(no subject)",
    date: row?.date ?? "",
    messageId: `<${emailId}@example.dev>`,
    threadId: emailId,
    references: "",
    starred: false,
    snippet: row?.snippet,
    unread: row?.unread ?? false,
    labelIds: getTestEmailLabelIds(accountId, emailId),
    body: isDraft ? (row?.snippet ?? "") : body,
    bodyHtml: undefined,
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

type Mail = readonly [
  name: string,
  subject: string,
  snippet: string,
  body?: string,
];

const FOLDER_MAIL: Record<
  Folder,
  { mail: readonly Mail[]; count: number; self?: boolean; allRead?: boolean }
> = {
  inbox: { mail: demoMail.senders as unknown as Mail[], count: 120 },
  labeled: { mail: demoMail.senders as unknown as Mail[], count: 8 }, // accordion view; satisfies Record<Folder>
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

/** Recover the source demo-mail tuple for a seeded id (mirrors makeTestEmails'
 *  index math) so the reader renders the same body. Undefined for composer drafts. */
function testMailEntry(accountId: string, emailId: string): Mail | undefined {
  const folder = folderFromId(accountId, emailId);
  const rest = emailId.startsWith(`${accountId}-`)
    ? emailId.slice(accountId.length + 1)
    : emailId;
  const i = Number(rest.split("-")[1]);
  if (!Number.isInteger(i)) return undefined;
  const seed = Number(accountId.replace(TEST_ACCOUNT_PREFIX, "")) || 1;
  const { mail } = FOLDER_MAIL[folder];
  return mail[(seed * 5 + i) % mail.length];
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
    const [name, subject, snippet] = mail[(seed * 5 + i) % mail.length];
    const from = self
      ? `You <${testAccountEmail(accountId)}>`
      : `${name} <noreply@${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com>`;
    const id = `${accountId}-${folder}-${i}`;
    const seedUnread = allRead ? false : (seed * 3 + i) % 4 === 0;
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

  // Merge composer-authored drafts ahead of seeded ones and drop deleted ids,
  // so the demo's Drafts folder reflects the user's edits.
  const merged =
    folder === "drafts" ? [...testAccountDrafts(accountId), ...rows] : rows;
  return merged
    .filter((row) => !deletedTestIds.has(row.id))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
