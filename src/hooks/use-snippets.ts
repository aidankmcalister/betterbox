import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSettings } from "@/hooks/use-settings";

export type Snippet = { id: string; trigger: string; text: string };

export const snippetsQueryKey = ["snippets"] as const;

/** Seeded snippets for demo mode so the composer never surfaces the real user's
 *  saved snippets during a recording. */
const DEMO_SNIPPETS: Snippet[] = [
  {
    id: "demo-intro",
    trigger: "/intro",
    text: "<p>Hi {{first_name}},</p><p>Thanks for reaching out about {{topic}}. {{cursor}}</p><p>Best,<br>Aidan</p>",
  },
  {
    id: "demo-ty",
    trigger: "/ty",
    text: "<p>Thanks so much, {{first_name}}!</p>",
  },
];

async function fetchSnippets(): Promise<Snippet[]> {
  const res = await fetch("/api/snippets");
  if (!res.ok) return [];
  const data = (await res.json()) as { snippets?: Snippet[] };
  return data.snippets ?? [];
}

/** Load the signed-in user's snippets. Pass `enabled` to defer the fetch until
 *  the composer (or settings) actually opens. In demo mode it returns a seeded
 *  set instead of hitting the real DB. */
export function useSnippetsQuery(enabled = true) {
  const demo = useSettings().demoMode;
  return useQuery({
    queryKey: demo ? (["snippets", "demo"] as const) : snippetsQueryKey,
    queryFn: demo ? async () => DEMO_SNIPPETS : fetchSnippets,
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
