import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
} from "@tanstack/react-query";
import type { ThreadRowEmail } from "@/components/thread-row";
import type { Account } from "@/lib/account";
import type { Folder } from "@/lib/folders";
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

export const emailsQueryKey = (accountId: string, folder: Folder = "inbox") =>
  ["emails", accountId, folder] as const;

export type EmailsPage = { emails: ThreadRowEmail[]; nextPageToken?: string };
export type EmailsData = InfiniteData<EmailsPage>;

export const flattenEmails = (data: EmailsData | undefined) =>
  data?.pages.flatMap((page) => page.emails);

/** Paged 50 at a time via Gmail's pageToken (roadmap: lift the 50 cap). */
export function useEmailsQuery(accountId: string, folder: Folder = "inbox") {
  return useInfiniteQuery({
    queryKey: emailsQueryKey(accountId, folder),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: EmailsPage) => last.nextPageToken ?? undefined,
    queryFn: async ({ pageParam }): Promise<EmailsPage> => {
      if (isTestAccount(accountId)) {
        return { emails: makeTestEmails(accountId) };
      }
      const pageQuery = pageParam
        ? `&pageToken=${encodeURIComponent(pageParam)}`
        : "";
      const data = await fetchJson<{
        emails?: ThreadRowEmail[];
        nextPageToken?: string | null;
      }>(`/api/emails?accountId=${accountId}&max=50&folder=${folder}${pageQuery}`);
      return {
        emails: data.emails ?? [],
        nextPageToken: data.nextPageToken ?? undefined,
      };
    },
  });
}

export type SearchHit = ThreadRowEmail & { accountId: string };

/** Gmail full-text search (messages.list q=) fanned out across accounts. */
export function useSearchEmailsQuery(accountIds: string[], q: string) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: ["search", accountIds, trimmed],
    enabled: trimmed.length >= 2,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<SearchHit[]> => {
      const results = await Promise.all(
        accountIds.map(async (accountId): Promise<SearchHit[]> => {
          if (isTestAccount(accountId)) {
            const needle = trimmed.toLowerCase();
            return makeTestEmails(accountId)
              .filter((email) =>
                [email.subject, email.from, email.snippet ?? ""].some(
                  (field) => field.toLowerCase().includes(needle),
                ),
              )
              .slice(0, 8)
              .map((email) => ({ ...email, accountId }));
          }
          const data = await fetchJson<{ emails?: ThreadRowEmail[] }>(
            `/api/emails?accountId=${accountId}&q=${encodeURIComponent(trimmed)}&max=8`,
          );
          return (data.emails ?? []).map((email) => ({ ...email, accountId }));
        }),
      );
      return results
        .flat()
        .sort(
          (a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0),
        );
    },
  });
}

export type AnalyticsDay = { date: string; received: number; sent: number };
export type TopSender = { name: string; email: string; count: number };
export type AccountAnalytics = { days: AnalyticsDay[]; topSenders: TopSender[] };
export type ScopedAnalytics = { accountId: string; analytics: AccountAnalytics };

/** Real per-account mailbox metrics for the Analytics page, fanned out across
 *  the scoped accounts. Cached 5 min — these are heavy (a list call per day). */
export function useAnalyticsQuery(accountIds: string[]) {
  return useQuery({
    queryKey: ["analytics", [...accountIds].sort()],
    enabled: accountIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ScopedAnalytics[]> =>
      Promise.all(
        accountIds.map(async (accountId): Promise<ScopedAnalytics> => {
          if (isTestAccount(accountId)) {
            return { accountId, analytics: { days: [], topSenders: [] } };
          }
          const data = await fetchJson<{ analytics: AccountAnalytics }>(
            `/api/analytics?accountId=${accountId}&days=30`,
          );
          return { accountId, analytics: data.analytics };
        }),
      ),
  });
}

/** One full message for the reader pane. */
export function useFullEmailQuery(accountId: string, emailId: string | null) {
  return useQuery({
    queryKey: ["email", accountId, emailId],
    enabled: emailId !== null,
    queryFn: async (): Promise<FullEmail> => {
      if (isTestAccount(accountId)) {
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
        return makeTestRawEmail(accountId, emailId!);
      }
      const data = await fetchJson<{ raw: string }>(
        `/api/message?accountId=${accountId}&id=${encodeURIComponent(emailId!)}&format=raw`,
      );
      return data.raw;
    },
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
