/**
 * Send guardrails (Composer Phase 3 — BOX-23).
 *
 * Cheap, last-second checks that catch the embarrassing send: no subject, "see
 * attached" with nothing attached, an unfilled snippet field, a surprise blast
 * to many people, or mail leaving your work domain. Pure + deterministic so the
 * composer can show them inline and gate the first Send click.
 */
export type Guardrail = { id: string; message: string };

// Free providers where "external domain" is meaningless (everyone is external).
const FREE_PROVIDERS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
]);

const ATTACH_RE = /\b(attach(ed|ment|ments|ing)?|enclosed|enclosure)\b/i;
const EMAIL_RE = /[^\s,;<>"]+@[^\s,;<>"]+\.[^\s,;<>"]+/g;

/** Pull the email addresses out of a comma/semicolon recipient string. */
function emails(value: string): string[] {
  return value.match(EMAIL_RE) ?? [];
}

const domainOf = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";

const plural = (n: number, one: string, many = `${one}s`) =>
  n === 1 ? one : many;

export function checkGuardrails(input: {
  subject: string;
  /** Plain text of the body (for the attachment-mention heuristic). */
  bodyText: string;
  to: string;
  cc?: string;
  bcc?: string;
  fromEmail: string;
  attachmentCount: number;
  /** Warn once the recipient count reaches this. */
  manyRecipientsAt?: number;
}): Guardrail[] {
  const out: Guardrail[] = [];

  if (!input.subject.trim()) {
    out.push({ id: "no-subject", message: "This message has no subject." });
  }

  if (ATTACH_RE.test(input.bodyText) && input.attachmentCount === 0) {
    out.push({
      id: "missing-attachment",
      message: "You mention an attachment, but nothing is attached.",
    });
  }

  const recipients = [
    ...emails(input.to),
    ...emails(input.cc ?? ""),
    ...emails(input.bcc ?? ""),
  ];

  const fromDomain = domainOf(input.fromEmail);
  if (fromDomain && !FREE_PROVIDERS.has(fromDomain)) {
    const external = recipients.filter((r) => domainOf(r) !== fromDomain);
    if (external.length > 0) {
      out.push({
        id: "external-domain",
        message: `${external.length} ${plural(
          external.length,
          "recipient",
        )} outside ${fromDomain}.`,
      });
    }
  }

  const threshold = input.manyRecipientsAt ?? 8;
  if (recipients.length >= threshold) {
    out.push({
      id: "many-recipients",
      message: `This goes to ${recipients.length} recipients.`,
    });
  }

  return out;
}

/** Whether a recipient is outside the sender's (non-free) domain — drives the
 *  external-recipient badge in the To field. Free-provider senders never flag. */
export function isExternalRecipient(
  recipientEmail: string,
  fromEmail: string,
): boolean {
  const fromDomain = domainOf(fromEmail);
  if (!fromDomain || FREE_PROVIDERS.has(fromDomain)) return false;
  const recipientDomain = domainOf(recipientEmail);
  return recipientDomain !== "" && recipientDomain !== fromDomain;
}
