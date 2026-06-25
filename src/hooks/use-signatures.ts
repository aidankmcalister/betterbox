import { useQuery } from "@tanstack/react-query";
import { useSettings } from "@/hooks/use-settings";
import { isTestAccount } from "@/lib/test-account";

export type Signature = { id: string; name: string; body: string };

export type SignaturesData = {
  signatures: Signature[];
  /** accountId (Google sub) → assigned signature id, or null. */
  assignments: Record<string, string | null>;
};

export const signaturesQueryKey = ["signatures"] as const;

/** Seeded signature for demo mode (assigned to both demo accounts) so the
 *  composer never surfaces the real user's signature during a recording. */
const DEMO_SIGNATURES: SignaturesData = {
  signatures: [{ id: "demo-sig", name: "Default", body: "Best,\nAidan" }],
  assignments: { "test-1": "demo-sig", "test-2": "demo-sig" },
};

async function fetchSignatures(): Promise<SignaturesData> {
  const res = await fetch("/api/signatures");
  if (!res.ok) return { signatures: [], assignments: {} };
  return (await res.json()) as SignaturesData;
}

export function useSignaturesQuery(enabled = true) {
  const demo = useSettings().demoMode;
  return useQuery({
    queryKey: demo ? (["signatures", "demo"] as const) : signaturesQueryKey,
    queryFn: demo ? async () => DEMO_SIGNATURES : fetchSignatures,
    enabled,
    staleTime: 60_000,
  });
}

export const gmailSignatureQueryKey = (accountId?: string, email?: string) =>
  ["gmail-signature", accountId, email] as const;

/** The account's native Gmail signature HTML (set in Gmail Settings, images and
 *  all). Empty string when unset or the settings scope isn't granted yet. */
export function useGmailSignatureQuery(
  accountId: string | undefined,
  email: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: gmailSignatureQueryKey(accountId, email),
    queryFn: async (): Promise<string> => {
      const params = new URLSearchParams();
      if (accountId) params.set("accountId", accountId);
      if (email) params.set("email", email);
      const res = await fetch(`/api/gmail-signature?${params}`);
      if (!res.ok) return "";
      const data = (await res.json()) as { signature?: string };
      return data.signature ?? "";
    },
    // Demo/test accounts have no Gmail to read — skip the real API round-trip.
    enabled: enabled && !!accountId && !isTestAccount(accountId ?? ""),
    staleTime: 5 * 60_000,
  });
}

/** Plain-text signature → a single HTML paragraph, line breaks preserved and
 *  HTML-escaped so user text can't inject markup. */
function signatureToHtml(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = text.split("\n").map(esc).join("<br>");
  return `<p>${lines}</p>`;
}

/** Append a signature to message HTML with exactly one blank line above it:
 *  trailing empty paragraphs in the message are trimmed first, then a single
 *  empty paragraph + the signature are added. An empty message yields just the
 *  signature (no leading blank). */
export function appendSignature(bodyHtml: string, sigText: string): string {
  const trimmed = bodyHtml.replace(
    /(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+$/gi,
    "",
  );
  const sig = signatureToHtml(sigText);
  return trimmed.trim() === "" ? sig : `${trimmed}<p></p>${sig}`;
}

/** Append an already-HTML signature (e.g. the native Gmail one) with exactly one
 *  blank line above it. The signature HTML is Gmail-authored, so it's email-safe
 *  as-is — no escaping or serializing. Trailing empty paragraphs are trimmed
 *  first; an empty message yields just the signature. */
export function appendSignatureHtml(bodyHtml: string, sigHtml: string): string {
  const sig = sigHtml.trim();
  const trimmed = bodyHtml.replace(
    /(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+$/gi,
    "",
  );
  if (!sig) return trimmed;
  return trimmed.trim() === "" ? sig : `${trimmed}<p></p>${sig}`;
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
