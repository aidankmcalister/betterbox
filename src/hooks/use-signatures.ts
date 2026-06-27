import { useQuery } from "@tanstack/react-query";
import { useSettings, isDemoMode } from "@/hooks/use-settings";
import { isTestAccount } from "@/lib/test-account";

export type Signature = { id: string; name: string; body: string };

export type SignaturesData = {
  signatures: Signature[];
  /** accountId (Google sub) → assigned signature id, or null. */
  assignments: Record<string, string | null>;
};

export const signaturesQueryKey = ["signatures"] as const;
export const signaturesDemoQueryKey = ["signatures", "demo"] as const;

/** Demo and real signatures live under separate keys; invalidate this after a mutation. */
export function activeSignaturesQueryKey() {
  return isDemoMode() ? signaturesDemoQueryKey : signaturesQueryKey;
}

/** In-memory demo store mutated by the demo-aware helpers; never touches the real DB. Resets on reload. */
const DEMO_SIGNATURE_SEED: SignaturesData = {
  signatures: [{ id: "demo-sig", name: "Default", body: "Best,\nJordan Lee" }],
  assignments: { "test-1": "demo-sig", "test-2": "demo-sig" },
};
let demoSignatures: SignaturesData = {
  signatures: DEMO_SIGNATURE_SEED.signatures.map((s) => ({ ...s })),
  assignments: { ...DEMO_SIGNATURE_SEED.assignments },
};
let demoSignatureSeq = 0;

const cloneDemoSignatures = (): SignaturesData => ({
  signatures: demoSignatures.signatures.map((s) => ({ ...s })),
  assignments: { ...demoSignatures.assignments },
});

async function fetchSignatures(): Promise<SignaturesData> {
  const res = await fetch("/api/signatures");
  if (!res.ok) return { signatures: [], assignments: {} };
  return (await res.json()) as SignaturesData;
}

/** Returns the in-memory demo set when demo mode is on OR the account is a test account. */
export function useSignaturesQuery(enabled = true, accountId?: string) {
  const demo =
    useSettings().demoMode || (!!accountId && isTestAccount(accountId));
  return useQuery({
    queryKey: demo ? signaturesDemoQueryKey : signaturesQueryKey,
    queryFn: demo ? async () => cloneDemoSignatures() : fetchSignatures,
    enabled,
    staleTime: 60_000,
  });
}

export async function saveSignature(input: {
  id?: string;
  name: string;
  body: string;
}): Promise<void> {
  if (isDemoMode()) {
    demoSignatures = {
      ...demoSignatures,
      signatures: input.id
        ? demoSignatures.signatures.map((s) =>
            s.id === input.id ? { ...s, name: input.name, body: input.body } : s,
          )
        : [
            ...demoSignatures.signatures,
            {
              id: `demo-sig-${demoSignatureSeq++}`,
              name: input.name,
              body: input.body,
            },
          ],
    };
    return;
  }
  const res = await fetch("/api/signatures", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      op: input.id ? "update" : "create",
      id: input.id,
      name: input.name,
      body: input.body,
    }),
  });
  const d = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(d.error ?? "Could not save signature");
}

export async function removeSignature(id: string): Promise<void> {
  if (isDemoMode()) {
    demoSignatures = {
      signatures: demoSignatures.signatures.filter((s) => s.id !== id),
      assignments: Object.fromEntries(
        Object.entries(demoSignatures.assignments).map(([k, v]) => [
          k,
          v === id ? null : v,
        ]),
      ),
    };
    return;
  }
  await fetch("/api/signatures", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "delete", id }),
  });
}

export async function assignSignature(
  accountId: string,
  signatureId: string | null,
): Promise<void> {
  if (isDemoMode()) {
    demoSignatures = {
      ...demoSignatures,
      assignments: { ...demoSignatures.assignments, [accountId]: signatureId },
    };
    return;
  }
  await fetch("/api/signatures", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "assign", accountId, signatureId }),
  });
}

export const gmailSignatureQueryKey = (accountId?: string, email?: string) =>
  ["gmail-signature", accountId, email] as const;

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

/** Text escaped so a plain-text signature can't inject markup. */
function signatureToHtml(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = text.split("\n").map(esc).join("<br>");
  return `<p>${lines}</p>`;
}

// Bounded so a pathological run of empty <p>s can't blow up the backtracker.
const TRAILING_EMPTY_PARAGRAPHS =
  /(?:<p>(?:\s|&nbsp;|<br\s*\/?>){0,200}<\/p>\s*){1,50}$/gi;

/** Appends with exactly one blank line above; trims trailing empty paragraphs, empty body yields just the signature. */
function joinWithSignature(bodyHtml: string, sigHtml: string): string {
  if (!sigHtml) return bodyHtml.replace(TRAILING_EMPTY_PARAGRAPHS, "");
  const trimmed = bodyHtml.replace(TRAILING_EMPTY_PARAGRAPHS, "");
  return trimmed.trim() === "" ? sigHtml : `${trimmed}<p></p>${sigHtml}`;
}

export function appendSignature(bodyHtml: string, sigText: string): string {
  return joinWithSignature(bodyHtml, signatureToHtml(sigText));
}

/** Appends an already-HTML signature (e.g. native Gmail); email-safe as-is, no escaping. */
export function appendSignatureHtml(bodyHtml: string, sigHtml: string): string {
  return joinWithSignature(bodyHtml, sigHtml.trim());
}

export function resolveAccountSignature(
  data: SignaturesData | undefined,
  accountId: string | undefined,
): Signature | null {
  if (!data || !accountId) return null;
  const sigId = data.assignments[accountId];
  return (sigId && data.signatures.find((s) => s.id === sigId)) || null;
}
