import type { FullEmail } from "@/lib/mail-queries";
import type { ExportFormat } from "@/hooks/use-settings";

/** Serialize and download a message as .md / .json / .txt (design Export menu). */
export function exportEmail(email: FullEmail, format: ExportFormat) {
  const name = `${slug(email.subject) || email.id}.${format}`;
  const mime = format === "json" ? "application/json" : "text/plain";
  download(name, serialize(email, format), `${mime};charset=utf-8`);
}

function serialize(email: FullEmail, format: ExportFormat): string {
  if (format === "json") return JSON.stringify(email, null, 2);
  if (format === "md") {
    return [
      `# ${email.subject || "(no subject)"}`,
      "",
      `**From:** ${email.from}`,
      `**To:** ${email.to}`,
      `**Date:** ${email.date}`,
      `**Message-ID:** \`${email.messageId}\``,
      "",
      "---",
      "",
      email.body,
    ].join("\n");
  }
  return [
    `From: ${email.from}`,
    `To: ${email.to}`,
    `Date: ${email.date}`,
    `Subject: ${email.subject}`,
    `Message-ID: ${email.messageId}`,
    "",
    email.body,
  ].join("\n");
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
