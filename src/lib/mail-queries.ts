import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
} from "@tanstack/react-query";
import type { ThreadRowEmail } from "@/components/thread-row";
import type { Account } from "@/lib/account";
import {
  isTestAccount,
  makeTestEmails,
  makeTestFullEmail,
} from "@/lib/test-account";

export type FullEmail = ThreadRowEmail & {
  to: string;
  messageId: string;
  body: string;
};

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

export const emailsQueryKey = (accountId: string) =>
  ["emails", accountId] as const;

export type EmailsPage = { emails: ThreadRowEmail[]; nextPageToken?: string };
export type EmailsData = InfiniteData<EmailsPage>;

export const flattenEmails = (data: EmailsData | undefined) =>
  data?.pages.flatMap((page) => page.emails);

/** Paged 50 at a time via Gmail's pageToken (roadmap: lift the 50 cap). */
export function useEmailsQuery(accountId: string) {
  return useInfiniteQuery({
    queryKey: emailsQueryKey(accountId),
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
      }>(`/api/emails?accountId=${accountId}&max=50${pageQuery}`);
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
        return makeTestFullEmail(accountId, emailId!);
      }
      const data = await fetchJson<{ email: FullEmail }>(
        `/api/message?accountId=${accountId}&id=${encodeURIComponent(emailId!)}`,
      );
      return data.email;
    },
  });
}

/** Send a plain-text message (test accounts pretend-send). */
export async function sendNewEmail(options: {
  accountId: string;
  to: string;
  subject: string;
  body: string;
}) {
  if (isTestAccount(options.accountId)) return;
  await fetchJson("/api/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(options),
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
