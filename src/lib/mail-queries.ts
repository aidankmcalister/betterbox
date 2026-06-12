import {
  useInfiniteQuery,
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
} from "@/lib/test-account";

export type FullEmail = ThreadRowEmail & {
  to: string;
  messageId: string;
  threadId: string;
  references: string;
  starred: boolean;
  body: string;
  bodyHtml?: string;
};

export type MessageAction = "archive" | "trash" | "star" | "unstar";

/** A tag — a Gmail user label. Nothing about it is stored by BetterBox. */
export type Label = {
  id: string;
  name: string;
  color?: { backgroundColor?: string; textColor?: string };
};

/** Preset tags for test/demo accounts (no Gmail backend). */
const TEST_LABELS: Label[] = [
  { id: "Label_vip", name: "VIP" },
  { id: "Label_receipts", name: "Receipts" },
  { id: "Label_followup", name: "Follow up" },
];

/**
 * TanStack Query layer over the mail API. Caching means panes repaint
 * instantly when tiles are rearranged or accounts toggled back into view,
 * instead of replaying 1 list + 50 metadata calls per pane.
 */

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

/** Folder listing vs. an in-pane search are cached under separate keys so
 *  toggling search doesn't clobber the folder list (and vice-versa). */
export const emailsQueryKey = (
  accountId: string,
  folder: Folder = "inbox",
  q?: string,
) =>
  q && q.trim()
    ? (["emails-search", accountId, folder, q.trim()] as const)
    : (["emails", accountId, folder] as const);

export type EmailsPage = { emails: ThreadRowEmail[]; nextPageToken?: string };
export type EmailsData = InfiniteData<EmailsPage>;

export const flattenEmails = (data: EmailsData | undefined) =>
  data?.pages.flatMap((page) => page.emails);

/**
 * One inbox pane's emails — paged 50 at a time via Gmail's pageToken. With a
 * `q` it becomes an in-pane Gmail search (server-side, full text + operators
 * like `in:important`), scoped to the CURRENT folder (the folder's Gmail query
 * is AND-ed with the user's query, e.g. `in:drafts github`).
 */
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
      // Scope the search to the folder: AND the folder query with the user's.
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


/** One full message for the reader pane. */
export function useFullEmailQuery(accountId: string, emailId: string | null) {
  return useQuery({
    queryKey: ["email", accountId, emailId],
    enabled: emailId !== null,
    queryFn: async (): Promise<FullEmail> => {
      if (isTestAccount(accountId)) {
        await sleep(READ_LATENCY_MS);
        return makeTestFullEmail(accountId, emailId!);
      }
      const data = await fetchJson<{ email: FullEmail }>(
        `/api/message?accountId=${accountId}&id=${encodeURIComponent(emailId!)}`,
      );
      return data.email;
    },
  });
}

/** Every message in the open conversation, oldest first (threads.get). */
export function useThreadQuery(
  accountId: string,
  threadId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["thread", accountId, threadId],
    enabled: !!threadId,
    queryFn: async (): Promise<FullEmail[]> => {
      if (isTestAccount(accountId)) {
        await sleep(READ_LATENCY_MS);
        return [makeTestFullEmail(accountId, threadId!)];
      }
      const data = await fetchJson<{ messages: FullEmail[] }>(
        `/api/message?accountId=${accountId}&thread=${encodeURIComponent(threadId!)}`,
      );
      return data.messages ?? [];
    },
  });
}

/** Raw RFC 822 source for the reader's Raw toggle. */
export function useRawEmailQuery(
  accountId: string,
  emailId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["email-raw", accountId, emailId],
    enabled: enabled && emailId !== null,
    queryFn: async (): Promise<string> => {
      if (isTestAccount(accountId)) {
        await sleep(READ_LATENCY_MS);
        return makeTestRawEmail(accountId, emailId!);
      }
      const data = await fetchJson<{ raw: string }>(
        `/api/message?accountId=${accountId}&id=${encodeURIComponent(emailId!)}&format=raw`,
      );
      return data.raw;
    },
  });
}

// ── Tags (Gmail user labels) ─────────────────────────────────────────────────

export const labelsQueryKey = (accountId: string) =>
  ["labels", accountId] as const;

/** The account's tags — Gmail user labels (system labels filtered out). */
export function useLabelsQuery(accountId: string) {
  return useQuery({
    queryKey: labelsQueryKey(accountId),
    queryFn: async (): Promise<Label[]> => {
      if (isTestAccount(accountId)) return TEST_LABELS;
      const data = await fetchJson<{
        labels?: { id: string; name: string; type?: string; color?: Label["color"] }[];
      }>(`/api/labels?accountId=${accountId}`);
      return (data.labels ?? [])
        .filter((label) => label.type === "user")
        .map(({ id, name, color }) => ({ id, name, color }));
    },
  });
}

/** Create a tag (Gmail label). Test accounts mint a local-only id. */
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

/** Rename a tag (no-op for test accounts — caller updates the cache). */
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

/** Delete a tag (no-op for test accounts — caller updates the cache). */
export async function deleteLabel(accountId: string, labelId: string) {
  if (isTestAccount(accountId)) return;
  await fetchJson("/api/labels", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId, op: "delete", labelId }),
  });
}

/** Tag / untag a message (no-op for test accounts — caller updates the cache). */
export async function setEmailLabel(
  accountId: string,
  id: string,
  labelId: string,
  on: boolean,
) {
  if (isTestAccount(accountId)) return;
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

/** Send a plain-text message (test accounts pretend-send). Pass the threading
 *  fields to nest it under the original conversation as a real reply. */
export async function sendNewEmail(options: {
  accountId: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}) {
  if (isTestAccount(options.accountId)) return;
  await fetchJson("/api/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(options),
  });
}

/** Archive / trash / star a single message (no-op for test accounts). */
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

/** Remove the UNREAD label from the given messages (no-op for test accounts). */
export async function markEmailsRead(accountId: string, ids: string[]) {
  if (isTestAccount(accountId) || ids.length === 0) return;
  await fetchJson(`/api/emails`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId, ids }),
  });
}

/** Mark every unread message in an account read (server pages is:unread). */
export async function markAllAccountRead(accountId: string) {
  if (isTestAccount(accountId)) return;
  await fetchJson(`/api/emails`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId, all: true }),
  });
}
