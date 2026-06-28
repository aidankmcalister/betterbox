import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSettings, isDemoMode } from "@/hooks/use-settings";
import { isTestAccount } from "@/lib/test-account";

export type Snippet = { id: string; trigger: string; text: string };

export const snippetsQueryKey = ["snippets"] as const;
export const snippetsDemoQueryKey = ["snippets", "demo"] as const;

/** Demo and real snippets live under separate keys; invalidate this after a mutation. */
export function activeSnippetsQueryKey() {
  return isDemoMode() ? snippetsDemoQueryKey : snippetsQueryKey;
}

export const OPEN_SNIPPET_DRAFT_EVENT = "bm:open-snippet-draft";
export type OpenSnippetDraftDetail = { text: string };

export function openSnippetDraft(text: string): void {
  window.dispatchEvent(
    new CustomEvent<OpenSnippetDraftDetail>(OPEN_SNIPPET_DRAFT_EVENT, {
      detail: { text },
    }),
  );
}

/** In-memory demo store mutated by the demo-aware helpers; never touches the real DB. Resets on reload. */
const DEMO_SNIPPET_SEED: Snippet[] = [
  {
    id: "demo-intro",
    trigger: "/intro",
    text: "<p>Hi {{first_name}},</p><p>Thanks for reaching out about {{topic}}. {{cursor}}</p><p>Best,<br>Jordan</p>",
  },
  {
    id: "demo-ty",
    trigger: "/ty",
    text: "<p>Thanks so much, {{first_name}}!</p>",
  },
];
let demoSnippets: Snippet[] = DEMO_SNIPPET_SEED.map((s) => ({ ...s }));
let demoSnippetSeq = 0;

async function fetchSnippets(): Promise<Snippet[]> {
  const res = await fetch("/api/snippets");
  if (!res.ok) return [];
  const data = (await res.json()) as { snippets?: Snippet[] };
  return data.snippets ?? [];
}

/** Returns the in-memory demo set when demo mode is on OR the account is a test account. */
export function useSnippetsQuery(enabled = true, accountId?: string) {
  const demo =
    useSettings().demoMode || (!!accountId && isTestAccount(accountId));
  return useQuery({
    queryKey: demo ? snippetsDemoQueryKey : snippetsQueryKey,
    queryFn: demo ? async () => [...demoSnippets] : fetchSnippets,
    enabled,
    staleTime: 60_000,
  });
}

export async function saveSnippet(input: {
  id?: string;
  trigger: string;
  text: string;
}): Promise<void> {
  if (isDemoMode()) {
    demoSnippets = input.id
      ? demoSnippets.map((s) =>
          s.id === input.id
            ? { ...s, trigger: input.trigger, text: input.text }
            : s,
        )
      : [
          ...demoSnippets,
          {
            id: `demo-${demoSnippetSeq++}`,
            trigger: input.trigger,
            text: input.text,
          },
        ];
    return;
  }
  const res = await fetch("/api/snippets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      op: input.id ? "update" : "create",
      id: input.id,
      trigger: input.trigger,
      text: input.text,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Could not save snippet");
}

export async function deleteSnippet(id: string): Promise<void> {
  if (isDemoMode()) {
    demoSnippets = demoSnippets.filter((s) => s.id !== id);
    return;
  }
  await fetch("/api/snippets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "delete", id }),
  });
}

export function useSnippetMap(
  enabled = true,
  accountId?: string,
): Record<string, string> {
  const { data } = useSnippetsQuery(enabled, accountId);
  return useMemo(
    () => Object.fromEntries((data ?? []).map((s) => [s.trigger, s.text])),
    [data],
  );
}
