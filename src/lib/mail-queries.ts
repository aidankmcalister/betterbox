import { useQuery } from "@tanstack/react-query";
import type { ThreadRowEmail } from "@/components/thread-row";
import type { Account } from "@/lib/account";
import { isTestAccount, makeTestEmails } from "@/lib/test-account";

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

export function useEmailsQuery(accountId: string) {
  return useQuery({
    queryKey: emailsQueryKey(accountId),
    queryFn: async () => {
      if (isTestAccount(accountId)) return makeTestEmails(accountId);
      const data = await fetchJson<{ emails?: ThreadRowEmail[] }>(
        `/api/emails?accountId=${accountId}&max=50`,
      );
      return data.emails ?? [];
    },
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
