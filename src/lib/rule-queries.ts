import { useQuery } from "@tanstack/react-query";
import type { Rule } from "@/lib/rules";

export type { Rule } from "@/lib/rules";

export type RuleInput = Omit<Rule, "id" | "enabled">;
export type RulePreview = { matched: number; samples: { from: string; subject: string }[] };

export const rulesQueryKey = ["rules"] as const;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

const post = (body: unknown, method = "POST") =>
  fetchJson("/api/rules", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

export function useRulesQuery(enabled: boolean) {
  return useQuery({
    queryKey: rulesQueryKey,
    enabled,
    queryFn: async () => {
      const data = await fetchJson<{ rules: Rule[] }>("/api/rules");
      return data.rules;
    },
  });
}

export const createRule = (input: RuleInput) =>
  post(input) as Promise<{ rule: Rule }>;

export const setRuleEnabled = (id: string, enabled: boolean) =>
  post({ id, enabled }, "PATCH");

export const deleteRule = (id: string) => post({ id }, "DELETE");

export const previewRule = (input: RuleInput) =>
  post({ ...input, op: "test" }) as Promise<RulePreview>;
