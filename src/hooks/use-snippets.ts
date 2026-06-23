import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

export type Snippet = { id: string; trigger: string; text: string };

export const snippetsQueryKey = ["snippets"] as const;

async function fetchSnippets(): Promise<Snippet[]> {
  const res = await fetch("/api/snippets");
  if (!res.ok) return [];
  const data = (await res.json()) as { snippets?: Snippet[] };
  return data.snippets ?? [];
}

/** Load the signed-in user's snippets. Pass `enabled` to defer the fetch until
 *  the composer (or settings) actually opens. */
export function useSnippetsQuery(enabled = true) {
  return useQuery({
    queryKey: snippetsQueryKey,
    queryFn: fetchSnippets,
    enabled,
    staleTime: 60_000,
  });
}

/** trigger → text map used by the editor's inline expansion. */
export function useSnippetMap(enabled = true): Record<string, string> {
  const { data } = useSnippetsQuery(enabled);
  return useMemo(
    () => Object.fromEntries((data ?? []).map((s) => [s.trigger, s.text])),
    [data],
  );
}
