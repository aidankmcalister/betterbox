import {
  useInfiniteQuery,
  useQueries,
  useQuery,
  type InfiniteData,
} from "@tanstack/react-query";
import type { ThreadRowEmail } from "@/components/thread-row";
import type { Account } from "@/lib/account";
import { FOLDER_QUERY, type Folder } from "@/lib/folders";
import {
  isTestAccount,
  makeTestEmails,
  makeTestFullEmail,
  makeTestRawEmail,
  markTestAccountRead,
  markTestEmailsRead,
  removeTestLabel,
  setTestEmailLabel,
  testLabelEmails,
  upsertTestDraft,
  deleteTestEmail,
} from "@/lib/test-account";

export type FullEmail = ThreadRowEmail & {
  to: string;
  /** Original Cc recipients (carried over by reply-all). Absent on demo mail. */
  cc?: string;
  /** cid → inline attachment, for rendering <img src="cid:…">. Absent on demo mail. */
  inlineAttachments?: Record<
    string,
    { attachmentId: string; mimeType: string }
  >;
  /** Named, downloadable attachments (the paperclip kind). */
  attachments?: {
    attachmentId: string;
    filename: string;
    mimeType: string;
    size: number;
  }[];
  messageId: string;
  threadId: string;
  references: string;
  starred: boolean;
  body: string;
  bodyHtml?: string;
};

export type MessageAction = "archive" | "trash" | "star" | "unstar";

// Never stored by BetterBox — only held in TanStack Query cache.
export type Label = {
  id: string;
  name: string;
  color?: { backgroundColor?: string; textColor?: string };
};

const TEST_LABELS: Label[] = [
  { id: "Label_vip", name: "VIP" },
  { id: "Label_receipts", name: "Receipts" },
  { id: "Label_followup", name: "Follow up" },
];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

/**
 * Test/demo accounts otherwise resolve in a single tick, which makes folder
 * switches read as a glitchy flash. A small artificial latency lets the
 * skeleton paint first, so demo mode loads like a real inbox would.
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const LIST_LATENCY_MS = 480;
const READ_LATENCY_MS = 260;

export const accountsQueryKey = ["accounts"] as const;

export type Contact = { name: string; email: string };

// Generic, non-personal stand-ins for the demo's compose autocomplete.
const DEMO_CONTACTS: Contact[] = [
  { name: "Alex Rivera", email: "alex.rivera@example.com" },
  { name: "Jordan Lee", email: "jordan@example.com" },
  { name: "Sam Patel", email: "sam.patel@example.com" },
  { name: "Taylor Kim", email: "taylor.kim@example.com" },
  { name: "Morgan Diaz", email: "morgan@example.dev" },
  { name: "Casey Nguyen", email: "casey.nguyen@example.com" },
  { name: "Riley Chen", email: "riley@example.dev" },
];

/** People you've emailed before, for compose To autocomplete. Test/demo
 *  accounts return a static set; real accounts hit /api/contacts (Sent). */
export function useContactsQuery(
  accountId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["contacts", accountId ?? "default"],
    enabled,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Contact[]> => {
      if (accountId && isTestAccount(accountId)) return DEMO_CONTACTS;
      const params = accountId
        ? `?accountId=${encodeURIComponent(accountId)}`
        : "";
      const data = await fetchJson<{ contacts?: Contact[] }>(
        `/api/contacts${params}`,
      );
      return data.contacts ?? [];
    },
  });
}

export function useAccountsQuery(enabled: boolean) {
  return useQuery({
    queryKey: accountsQueryKey,
    enabled,
    queryFn: async () => {
      const data = await fetchJson<{ accounts?: Account[] }>("/api/accounts");
      return data.accounts ?? [];
    },
  });
}

// Folder listing and in-pane search use separate cache keys so toggling search doesn't clobber the folder list.
export const emailsQueryKey = (
  accountId: string,
  folder: Folder = "inbox",
  q?: string,
) =>
  q?.trim()
    ? (["emails-search", accountId, folder, q.trim()] as const)
    : (["emails", accountId, folder] as const);

export type EmailsPage = { emails: ThreadRowEmail[]; nextPageToken?: string };
export type EmailsData = InfiniteData<EmailsPage>;

export const flattenEmails = (data: EmailsData | undefined) =>
  data?.pages.flatMap((page) => page.emails);

// Search is scoped to the current folder: FOLDER_QUERY[folder] is AND-ed with the user's q.
export function useEmailsQuery(
  accountId: string,
  folder: Folder = "inbox",
  q?: string,
) {
  const search = q?.trim();
  return useInfiniteQuery({
    queryKey: emailsQueryKey(accountId, folder, search),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: EmailsPage) => last.nextPageToken ?? undefined,
    queryFn: async ({ pageParam }): Promise<EmailsPage> => {
      if (isTestAccount(accountId)) {
        await sleep(LIST_LATENCY_MS);
        const list = makeTestEmails(accountId, folder);
        if (!search) return { emails: list };
        const needle = search.toLowerCase();
        return {
          emails: list.filter((email) =>
            [email.subject, email.from, email.snippet ?? ""].some((field) =>
              field.toLowerCase().includes(needle),
            ),
          ),
        };
      }
      const pageQuery = pageParam
        ? `&pageToken=${encodeURIComponent(pageParam)}`
        : "";
      const scope = search
        ? `&q=${encodeURIComponent(`${FOLDER_QUERY[folder]} ${search}`)}`
        : `&folder=${folder}`;
      const data = await fetchJson<{
        emails?: ThreadRowEmail[];
        nextPageToken?: string | null;
      }>(`/api/emails?accountId=${accountId}&max=50${scope}${pageQuery}`);
      return {
        emails: data.emails ?? [],
        nextPageToken: data.nextPageToken ?? undefined,
      };
    },
  });
}

export function useLabelEmailsQuery(
  accountId: string,
  label: Label,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: ["emails-label", accountId, label.id],
    enabled,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: EmailsPage) => last.nextPageToken ?? undefined,
    queryFn: async ({ pageParam }): Promise<EmailsPage> => {
      if (isTestAccount(accountId)) {
        await sleep(READ_LATENCY_MS);
        return { emails: testLabelEmails(accountId, label.id) };
      }
      const pageQuery = pageParam
        ? `&pageToken=${encodeURIComponent(pageParam)}`
        : "";
      const data = await fetchJson<{
        emails?: ThreadRowEmail[];
        nextPageToken?: string | null;
      }>(
        `/api/emails?accountId=${accountId}&max=50&q=${encodeURIComponent(
          `label:"${label.name}"`,
        )}${pageQuery}`,
      );
      return {
        emails: data.emails ?? [],
        nextPageToken: data.nextPageToken ?? undefined,
      };
    },
  });
}

export async function fetchFullEmail(
  accountId: string,
  emailId: string,
): Promise<FullEmail> {
  if (isTestAccount(accountId)) return makeTestFullEmail(accountId, emailId);
  const data = await fetchJson<{ email: FullEmail }>(
    `/api/message?accountId=${accountId}&id=${encodeURIComponent(emailId)}`,
  );
  return data.email;
}

export function useFullEmailQuery(accountId: string, emailId: string | null) {
  return useQuery({
    queryKey: ["email", accountId, emailId],
    enabled: emailId !== null,
    queryFn: async (): Promise<FullEmail> => {
      if (emailId === null) throw new Error("emailId is required");
      if (isTestAccount(accountId)) await sleep(READ_LATENCY_MS);
      return fetchFullEmail(accountId, emailId);
    },
  });
}

/** A draft that continues an existing thread (vs. a brand-new message) — opened
 *  in the thread reader rather than the standalone composer. */
export function isReplyDraft(email: {
  id: string;
  threadId?: string;
  references?: string;
  subject?: string;
}): boolean {
  return (
    (!!email.threadId && email.threadId !== email.id) ||
    !!email.references?.trim() ||
    /^re:/i.test(email.subject ?? "")
  );
}

export function useThreadQuery(
  accountId: string,
  threadId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["thread", accountId, threadId],
    enabled: !!threadId,
    queryFn: async (): Promise<FullEmail[]> => {
      if (!threadId) throw new Error("threadId is required");
      if (isTestAccount(accountId)) {
        await sleep(READ_LATENCY_MS);
        return [makeTestFullEmail(accountId, threadId)];
      }
      const data = await fetchJson<{ messages: FullEmail[] }>(
        `/api/message?accountId=${accountId}&thread=${encodeURIComponent(threadId)}`,
      );
      return data.messages ?? [];
    },
  });
}

export function useRawEmailQuery(
  accountId: string,
  emailId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["email-raw", accountId, emailId],
    enabled: enabled && emailId !== null,
    queryFn: async (): Promise<string> => {
      if (emailId === null) throw new Error("emailId is required");
      if (isTestAccount(accountId)) {
        await sleep(READ_LATENCY_MS);
        return makeTestRawEmail(accountId, emailId);
      }
      const data = await fetchJson<{ raw: string }>(
        `/api/message?accountId=${accountId}&id=${encodeURIComponent(emailId)}&format=raw`,
      );
      return data.raw;
    },
  });
}

export const labelsQueryKey = (accountId: string) =>
  ["labels", accountId] as const;

function labelsQueryOptions(accountId: string) {
  return {
    queryKey: labelsQueryKey(accountId),
    queryFn: async (): Promise<Label[]> => {
      if (isTestAccount(accountId)) return TEST_LABELS;
      const data = await fetchJson<{
        labels?: {
          id: string;
          name: string;
          type?: string;
          color?: Label["color"];
        }[];
      }>(`/api/labels?accountId=${accountId}`);
      return (data.labels ?? [])
        .filter((label) => label.type === "user")
        .map(({ id, name, color }) => ({ id, name, color }));
    },
  };
}

export function useLabelsQuery(accountId: string) {
  return useQuery(labelsQueryOptions(accountId));
}

/** Labels across several accounts, deduped by name (case-insensitive) — one
 *  entry per distinct name. */
export function useAccountsLabels(accountIds: string[]): Label[] {
  const results = useQueries({ queries: accountIds.map(labelsQueryOptions) });
  const seen = new Set<string>();
  const merged: Label[] = [];
  for (const result of results) {
    for (const label of result.data ?? []) {
      const key = label.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(label);
    }
  }
  return merged;
}

export async function createLabel(
  accountId: string,
  name: string,
): Promise<Label> {
  if (isTestAccount(accountId)) {
    return { id: `Label_${name.replace(/\s+/g, "_")}_${name.length}`, name };
  }
  const data = await fetchJson<{ label: Label }>("/api/labels", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId, op: "create", name }),
  });
  return data.label;
}

export async function renameLabel(
  accountId: string,
  labelId: string,
  name: string,
) {
  if (isTestAccount(accountId)) return;
  await fetchJson("/api/labels", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId, op: "rename", labelId, name }),
  });
}

export async function deleteLabel(accountId: string, labelId: string) {
  if (isTestAccount(accountId)) {
    removeTestLabel(accountId, labelId);
    return;
  }
  await fetchJson("/api/labels", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId, op: "delete", labelId }),
  });
}

export async function setEmailLabel(
  accountId: string,
  id: string,
  labelId: string,
  on: boolean,
) {
  if (isTestAccount(accountId)) {
    setTestEmailLabel(accountId, id, labelId, on);
    return;
  }
  await fetchJson("/api/labels", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      accountId,
      op: on ? "apply" : "remove",
      id,
      labelId,
    }),
  });
}

export async function sendNewEmail(options: {
  accountId: string;
  to: string;
  cc?: string;
  subject: string;
  body: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
  attachments?: { filename: string; mimeType: string; contentBase64: string }[];
}) {
  if (isTestAccount(options.accountId)) return;
  await fetchJson("/api/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(options),
  });
}

/** Save the composer's current content as a draft. Returns the draft id (demo
 *  only — real Gmail draft persistence isn't wired yet, so it's a no-op there). */
export async function saveDraft(opts: {
  accountId: string;
  id?: string;
  to: string;
  subject: string;
  html: string;
}): Promise<string | null> {
  if (isTestAccount(opts.accountId)) return upsertTestDraft(opts);
  return null;
}

/** Delete a draft so it leaves the Drafts folder. Demo: drop from the store.
 *  Real: trash the underlying message (we don't track the Gmail draft id yet,
 *  but trashing removes it from Drafts). */
export async function deleteDraft(accountId: string, emailId: string) {
  if (isTestAccount(accountId)) {
    deleteTestEmail(emailId);
    return;
  }
  await actOnEmail(accountId, emailId, "trash");
}

export async function actOnEmail(
  accountId: string,
  id: string,
  action: MessageAction,
) {
  if (isTestAccount(accountId)) return;
  await fetchJson("/api/message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId, id, action }),
  });
}

export async function markEmailsRead(accountId: string, ids: string[]) {
  if (ids.length === 0) return;
  if (isTestAccount(accountId)) {
    markTestEmailsRead(ids);
    return;
  }
  await fetchJson(`/api/emails`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId, ids }),
  });
}

export async function markAllAccountRead(accountId: string) {
  if (isTestAccount(accountId)) {
    markTestAccountRead(accountId);
    return;
  }
  await fetchJson(`/api/emails`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId, all: true }),
  });
}
