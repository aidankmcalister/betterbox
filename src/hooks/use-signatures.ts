import { useQuery } from "@tanstack/react-query";

export type Signature = { id: string; name: string; body: string };

export type SignaturesData = {
  signatures: Signature[];
  /** accountId (Google sub) → assigned signature id, or null. */
  assignments: Record<string, string | null>;
};

export const signaturesQueryKey = ["signatures"] as const;

async function fetchSignatures(): Promise<SignaturesData> {
  const res = await fetch("/api/signatures");
  if (!res.ok) return { signatures: [], assignments: {} };
  return (await res.json()) as SignaturesData;
}

export function useSignaturesQuery(enabled = true) {
  return useQuery({
    queryKey: signaturesQueryKey,
    queryFn: fetchSignatures,
    enabled,
    staleTime: 60_000,
  });
}

/** Plain-text signature → editor HTML: a blank line, then the signature with
 *  line breaks, HTML-escaped so user text can't inject markup. */
export function signatureToHtml(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = text.split("\n").map(esc).join("<br>");
  return `<p></p><p>${lines}</p>`;
}

/** The Signature assigned to an account, or null if none. */
export function resolveAccountSignature(
  data: SignaturesData | undefined,
  accountId: string | undefined,
): Signature | null {
  if (!data || !accountId) return null;
  const sigId = data.assignments[accountId];
  return (sigId && data.signatures.find((s) => s.id === sigId)) || null;
}
