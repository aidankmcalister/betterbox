import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSettings } from "@/hooks/use-settings";

export type Snippet = { id: string; trigger: string; text: string };

export const snippetsQueryKey = ["snippets"] as const;

/** Dispatched by the composer's "Save as snippet" — opens Settings → Snippets
 *  with a new snippet pre-filled with the selected body, so the trigger is set
 *  in the real editor instead of a bare browser prompt. */
export const OPEN_SNIPPET_DRAFT_EVENT = "bm:open-snippet-draft";
export type OpenSnippetDraftDetail = { text: string };

export function openSnippetDraft(text: string): void {
  window.dispatchEvent(
    new CustomEvent<OpenSnippetDraftDetail>(OPEN_SNIPPET_DRAFT_EVENT, {
      detail: { text },
    }),
  );
}

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
