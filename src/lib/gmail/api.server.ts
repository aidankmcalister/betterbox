import { randomUUID } from "node:crypto";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const METADATA_HEADERS = ["Subject", "From", "Date"];

export type Email = {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet?: string;
  unread?: boolean;
  /** Never persisted. */
  labelIds?: string[];
};

export type GmailLabel = {
  id: string;
  name: string;
  type?: "system" | "user";
  color?: { backgroundColor?: string; textColor?: string };
};

export async function listLabels(accessToken: string): Promise<GmailLabel[]> {
  const res = await gmailFetch(accessToken, "/labels");
  if (!res.ok) throw new Error(`Gmail labels list failed (${res.status})`);
  const { labels = [] } = (await res.json()) as { labels?: GmailLabel[] };
  return labels;
}

export async function createLabel(
  accessToken: string,
  name: string,
): Promise<GmailLabel> {
  const res = await gmailFetch(accessToken, "/labels", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }),
  });
  if (!res.ok) throw new Error(`Gmail label create failed (${res.status})`);
  return (await res.json()) as GmailLabel;
}

export async function renameLabel(
  accessToken: string,
  id: string,
  name: string,
): Promise<GmailLabel> {
  const res = await gmailFetch(accessToken, `/labels/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Gmail label rename failed (${res.status})`);
  return (await res.json()) as GmailLabel;
}

/** Deleting a label also strips it from every message (Gmail API side-effect). */
export async function deleteLabel(
  accessToken: string,
  id: string,
): Promise<void> {
  const res = await gmailFetch(accessToken, `/labels/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Gmail label delete failed (${res.status})`);
}

export async function modifyMessageLabels(
  accessToken: string,
  id: string,
  add: string[],
  remove: string[],
): Promise<void> {
  const res = await gmailFetch(accessToken, `/messages/${id}/modify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
  });
  if (!res.ok) throw new Error(`Gmail modify labels failed (${res.status})`);
}

export async function getEmailAddress(accessToken: string): Promise<string> {
  const res = await gmailFetch(accessToken, "/profile");
  if (!res.ok) return "";
  const { emailAddress } = (await res.json()) as { emailAddress?: string };
  return emailAddress ?? "";
}

export async function getInboxUnread(accessToken: string): Promise<number> {
  const res = await gmailFetch(accessToken, "/labels/INBOX");
  if (!res.ok) return 0;
  const { messagesUnread } = (await res.json()) as { messagesUnread?: number };
  return messagesUnread ?? 0;
}

export async function listRecentEmails(
  accessToken: string,
  max = 50,
  pageToken?: string,
  q?: string,
): Promise<{ emails: Email[]; nextPageToken?: string }> {
  const { ids, nextPageToken } = await listMessageIds(
    accessToken,
    max,
    pageToken,
    q,
  );
  const emails = await mapPool(ids, 8, (id) => fetchEmail(accessToken, id));
  return { emails, nextPageToken };
}

export async function searchEmails(
  accessToken: string,
  q: string,
  max = 8,
): Promise<Email[]> {
  const { ids } = await listMessageIds(accessToken, max, undefined, q);
  return mapPool(ids, 8, (id) => fetchEmail(accessToken, id));
}

export type Contact = { name: string; email: string };

/** People you've emailed before — recipients pulled from recent Sent messages,
 *  ranked by how often they appear. Powers the compose To autocomplete. */
export async function listContacts(accessToken: string): Promise<Contact[]> {
  const { ids } = await listMessageIds(accessToken, 40, undefined, "in:sent");
  const lists = await mapPool(ids, 8, (id) => fetchRecipients(accessToken, id));
  const byEmail = new Map<string, { name: string; email: string; n: number }>();
  for (const recipients of lists) {
    for (const r of recipients) {
      const key = r.email.toLowerCase();
      const hit = byEmail.get(key);
      if (hit) {
        hit.n++;
        if (!hit.name && r.name) hit.name = r.name;
      } else {
        byEmail.set(key, { name: r.name, email: r.email, n: 1 });
      }
    }
  }
  return [...byEmail.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 100)
    .map(({ name, email }) => ({ name, email }));
}

async function fetchRecipients(
  accessToken: string,
  id: string,
): Promise<Contact[]> {
  const res = await gmailFetchOk(
    accessToken,
    `/messages/${id}?format=metadata&metadataHeaders=To&metadataHeaders=Cc`,
  );
  if (!res.ok) return [];
  const message = (await res.json()) as {
    payload?: { headers?: { name: string; value: string }[] };
  };
  const header = (name: string) =>
    message.payload?.headers?.find(
      (h) => h.name.toLowerCase() === name.toLowerCase(),
    )?.value ?? "";
  return [...parseAddressList(header("To")), ...parseAddressList(header("Cc"))];
}

function parseAddressList(raw: string): Contact[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => {
      const angled = part.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
      if (angled) {
        return { name: angled[1].trim(), email: angled[2].trim() };
      }
      const bare = part.trim();
      return { name: "", email: bare };
    })
    .filter((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email));
}

async function listMessageIds(
  accessToken: string,
  max: number,
  pageToken?: string,
  q?: string,
): Promise<{ ids: string[]; nextPageToken?: string }> {
  const query =
    `/messages?maxResults=${max}` +
    (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "") +
    (q ? `&q=${encodeURIComponent(q)}` : "");
  const res = await gmailFetch(accessToken, query);
  if (!res.ok) throw new Error(`Gmail list failed (${res.status})`);
  const { messages = [], nextPageToken } = (await res.json()) as {
    messages?: { id: string }[];
    nextPageToken?: string;
  };
  return { ids: messages.map((message) => message.id), nextPageToken };
}

async function fetchEmail(accessToken: string, id: string): Promise<Email> {
  const headers = METADATA_HEADERS.map((h) => `metadataHeaders=${h}`).join("&");
  const res = await gmailFetchOk(
    accessToken,
    `/messages/${id}?format=metadata&${headers}`,
  );
  if (!res.ok) {
    // Couldn't load this row even after retries; mark it so it's not a silent
    // "(no subject)" masquerading as a real, empty email.
    return {
      id,
      from: "",
      subject: "(couldn’t load)",
      date: "",
      unread: false,
    };
  }
  const message = (await res.json()) as {
    snippet?: string;
    labelIds?: string[];
    payload?: { headers?: { name: string; value: string }[] };
  };
  // Gmail returns headers in their original (sender-chosen) casing, so match
  // case-insensitively — otherwise some messages come back with empty
  // Subject/From and render as "(no subject)" with no sender.
  const header = (name: string) =>
    message.payload?.headers?.find(
      (h) => h.name.toLowerCase() === name.toLowerCase(),
    )?.value ?? "";

  return {
    id,
    from: header("From"),
    subject: header("Subject"),
    date: header("Date"),
    snippet: message.snippet,
    unread: message.labelIds?.includes("UNREAD") ?? false,
    labelIds: message.labelIds ?? [],
  };
}

export type FullEmail = Email & {
  to: string;
  cc: string;
  messageId: string;
  /** Used to thread replies. */
  threadId: string;
  references: string;
  starred: boolean;
  labelIds: string[];
  hasAttachment: boolean;
  /** cid (Content-ID, sans angle brackets) → attachment, for rendering inline
   *  images referenced as <img src="cid:…">. */
  inlineAttachments: Record<string, InlineAttachment>;
  /** Named, downloadable attachments (excludes inline cid: images). */
  attachments: AttachmentMeta[];
  body: string;
  bodyHtml?: string;
};

type MessagePart = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: MessagePart[];
};

/** An inline (Content-ID) attachment — fetched on demand to render cid: images. */
export type InlineAttachment = { attachmentId: string; mimeType: string };

/** A named, downloadable attachment (the paperclip kind, not inline images). */
export type AttachmentMeta = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
};

type RawMessage = {
  id?: string;
  snippet?: string;
  labelIds?: string[];
  threadId?: string;
  payload?: MessagePart & { headers?: { name: string; value: string }[] };
};

function parseMessage(message: RawMessage): FullEmail {
  const header = (name: string) =>
    message.payload?.headers?.find(
      (h) => h.name.toLowerCase() === name.toLowerCase(),
    )?.value ?? "";

  return {
    id: message.id ?? "",
    from: header("From"),
    to: header("To"),
    cc: header("Cc"),
    subject: header("Subject"),
    date: header("Date"),
    messageId: header("Message-ID"),
    threadId: message.threadId ?? "",
    references: header("References"),
    starred: message.labelIds?.includes("STARRED") ?? false,
    labelIds: message.labelIds ?? [],
    hasAttachment: message.payload ? hasAttachmentPart(message.payload) : false,
    inlineAttachments: message.payload ? collectInline(message.payload) : {},
    attachments: message.payload ? collectAttachments(message.payload) : [],
    snippet: message.snippet,
    unread: message.labelIds?.includes("UNREAD") ?? false,
    ...extractBody(message.payload),
  };
}

/** True if any MIME part is a named attachment (has a filename). */
function hasAttachmentPart(part: MessagePart): boolean {
  if (part.filename && part.filename.length > 0) return true;
  return (part.parts ?? []).some(hasAttachmentPart);
}

/** Walk the MIME tree collecting parts that carry a Content-ID and a fetchable
 *  attachmentId — these back <img src="cid:…"> inline images. */
function collectInline(
  part: MessagePart,
  out: Record<string, InlineAttachment> = {},
): Record<string, InlineAttachment> {
  const cid = part.headers?.find(
    (h) => h.name.toLowerCase() === "content-id",
  )?.value;
  if (cid && part.body?.attachmentId) {
    const key = cid.trim().replace(/^<|>$/g, "");
    out[key] = {
      attachmentId: part.body.attachmentId,
      mimeType: part.mimeType ?? "application/octet-stream",
    };
  }
  for (const child of part.parts ?? []) collectInline(child, out);
  return out;
}

/** Walk the MIME tree collecting named, downloadable attachments — parts with a
 *  filename and a fetchable attachmentId. Skips inline images (those carry a
 *  Content-ID and are rendered in the body, not listed as attachments). */
function collectAttachments(
  part: MessagePart,
  out: AttachmentMeta[] = [],
): AttachmentMeta[] {
  const hasCid = part.headers?.some(
    (h) => h.name.toLowerCase() === "content-id",
  );
  if (part.filename && part.body?.attachmentId && !hasCid) {
    out.push({
      attachmentId: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body.size ?? 0,
    });
  }
  for (const child of part.parts ?? []) collectAttachments(child, out);
  return out;
}

/** Raw bytes of one attachment (Gmail base64url-decoded). */
export async function getAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<ArrayBuffer> {
  const res = await gmailFetch(
    accessToken,
    `/messages/${messageId}/attachments/${attachmentId}`,
  );
  if (!res.ok) throw new Error(`Gmail attachment failed (${res.status})`);
  const { data = "" } = (await res.json()) as { data?: string };
  const buf = Buffer.from(data, "base64url");
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
}

export async function getFullEmail(
  accessToken: string,
  id: string,
): Promise<FullEmail> {
  const res = await gmailFetch(accessToken, `/messages/${id}?format=full`);
  if (!res.ok) throw new Error(`Gmail get failed (${res.status})`);
  return parseMessage(await res.json());
}

export async function getThread(
  accessToken: string,
  threadId: string,
): Promise<FullEmail[]> {
  const res = await gmailFetch(accessToken, `/threads/${threadId}?format=full`);
  if (!res.ok) throw new Error(`Gmail thread get failed (${res.status})`);
  const data = (await res.json()) as { messages?: RawMessage[] };
  return (data.messages ?? []).map(parseMessage);
}

function extractBody(payload?: MessagePart): {
  body: string;
  bodyHtml?: string;
} {
  if (!payload) return { body: "" };
  const html = findPart(payload, "text/html");
  const bodyHtml = html ? decodePart(html) : undefined;
  const plain = findPart(payload, "text/plain");
  const body = plain ? decodePart(plain) : bodyHtml ? stripHtml(bodyHtml) : "";
  return { body, bodyHtml };
}

function findPart(part: MessagePart, mimeType: string): MessagePart | null {
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

function decodePart(part: MessagePart): string {
  return Buffer.from(part.body?.data ?? "", "base64url").toString("utf8");
}

function stripHtml(html: string): string {
  return (
    html
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Table-heavy HTML leaves heavy indentation and blank runs — collapse the
      // inline whitespace, trim each line, then squeeze blank lines so exports
      // aren't mostly empty space.
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

export async function getRawEmail(
  accessToken: string,
  id: string,
): Promise<string> {
  const res = await gmailFetch(accessToken, `/messages/${id}?format=raw`);
  if (!res.ok) throw new Error(`Gmail get failed (${res.status})`);
  const { raw = "" } = (await res.json()) as { raw?: string };
  return Buffer.from(raw, "base64url").toString("utf8");
}

/** Send a message from the token's own address (messages.send). Pass `html`
 *  for rich text (sent as multipart/alternative with a plain-text fallback);
 *  pass inReplyTo/references/threadId to thread it as a real reply. */
export async function sendEmail(
  accessToken: string,
  options: {
    to: string;
    cc?: string;
    subject: string;
    body: string;
    html?: string;
    inReplyTo?: string;
    references?: string;
    threadId?: string;
    attachments?: {
      filename: string;
      mimeType: string;
      contentBase64: string;
    }[];
  },
): Promise<void> {
  const from = await getEmailAddress(accessToken);
  if (!from) throw new Error("Could not resolve sender address");

  // Strip CR/LF so a value can't inject extra headers (e.g. a hidden Bcc).
  // Matters most for In-Reply-To/References, which are copied from the
  // replied-to message's headers — attacker-controlled if they sent it.
  const headerSafe = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

  const headerLines = [
    `From: ${headerSafe(from)}`,
    `To: ${headerSafe(options.to)}`,
    `Subject: ${encodeSubject(options.subject)}`,
    "MIME-Version: 1.0",
  ];
  // Cc is visible to every recipient (unlike Bcc); reply-all carries it over.
  if (options.cc?.trim())
    headerLines.splice(2, 0, `Cc: ${headerSafe(options.cc)}`);
  // Threading headers make Gmail (and every other client) nest the reply
  // under the original conversation instead of starting a new one.
  if (options.inReplyTo)
    headerLines.push(`In-Reply-To: ${headerSafe(options.inReplyTo)}`);
  if (options.references)
    headerLines.push(`References: ${headerSafe(options.references)}`);

  // base64 the part bodies so UTF-8 (emoji, accents) survives intact.
  const b64 = (s: string) =>
    Buffer.from(s, "utf8")
      .toString("base64")
      .replace(/(.{76})/g, "$1\r\n");

  // The message body, as a single MIME part: text/plain alone, or a
  // multipart/alternative (plain + html). `bodyType` is its Content-Type header
  // value; `bodyRest` is everything after that header.
  let bodyType: string;
  let bodyRest: string[];
  if (options.html?.trim()) {
    const text = options.body.trim() ? options.body : stripHtml(options.html);
    const altBoundary = `bbalt_${randomUUID()}`;
    bodyType = `multipart/alternative; boundary="${altBoundary}"`;
    bodyRest = [
      "",
      `--${altBoundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      b64(text),
      `--${altBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      b64(options.html),
      `--${altBoundary}--`,
    ];
  } else {
    bodyType = 'text/plain; charset="UTF-8"';
    bodyRest = ["Content-Transfer-Encoding: base64", "", b64(options.body)];
  }

  const attachments = options.attachments ?? [];
  let mime: string;
  if (attachments.length === 0) {
    mime = [...headerLines, `Content-Type: ${bodyType}`, ...bodyRest].join(
      "\r\n",
    );
  } else {
    // Wrap the body part and the attachments in a multipart/mixed envelope.
    const mixed = `bbmix_${randomUUID()}`;
    const lines = [
      ...headerLines,
      `Content-Type: multipart/mixed; boundary="${mixed}"`,
      "",
      `--${mixed}`,
      `Content-Type: ${bodyType}`,
      ...bodyRest,
    ];
    for (const att of attachments) {
      // Strip CR/LF/quotes from the filename so it can't break out of the
      // header; keep only valid base64 chars, then wrap at 76 columns.
      const name = att.filename.replace(/[\r\n"]+/g, "_");
      const data = att.contentBase64
        .replace(/[^A-Za-z0-9+/=]/g, "")
        .replace(/(.{76})/g, "$1\r\n");
      lines.push(
        `--${mixed}`,
        `Content-Type: ${headerSafe(att.mimeType || "application/octet-stream")}; name="${name}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${name}"`,
        "",
        data,
      );
    }
    lines.push(`--${mixed}--`);
    mime = lines.join("\r\n");
  }

  const payload: { raw: string; threadId?: string } = {
    raw: Buffer.from(mime).toString("base64url"),
  };
  if (options.threadId) payload.threadId = options.threadId;

  const res = await gmailFetch(accessToken, "/messages/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Gmail send failed (${res.status})`);
}

export type MessageAction = "archive" | "trash" | "star" | "unstar";

export async function actOnEmail(
  accessToken: string,
  id: string,
  action: MessageAction,
): Promise<void> {
  const path =
    action === "trash" ? `/messages/${id}/trash` : `/messages/${id}/modify`;
  const body =
    action === "trash"
      ? undefined
      : JSON.stringify(
          action === "archive"
            ? { removeLabelIds: ["INBOX"] }
            : action === "star"
              ? { addLabelIds: ["STARRED"] }
              : { removeLabelIds: ["STARRED"] },
        );

  const res = await gmailFetch(accessToken, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  if (!res.ok) throw new Error(`Gmail ${action} failed (${res.status})`);
}

/** RFC 2047 encoded-word for non-ASCII subjects. */
function encodeSubject(subject: string): string {
  return /^[\x20-\x7e]*$/.test(subject)
    ? subject
    : `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
}

/** batchModify caps at 1000 ids. */
export async function markEmailsRead(
  accessToken: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const res = await gmailFetch(accessToken, "/messages/batchModify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ids: ids.slice(0, 1000),
      removeLabelIds: ["UNREAD"],
    }),
  });
  if (!res.ok) throw new Error(`Gmail batchModify failed (${res.status})`);
}

/** Pages through all is:unread messages; capped at 10 000 to avoid hanging on a large mailbox. */
export async function markAccountRead(accessToken: string): Promise<number> {
  let total = 0;
  let pageToken: string | undefined;
  do {
    const { ids, nextPageToken } = await listMessageIds(
      accessToken,
      500,
      pageToken,
      "is:unread",
    );
    if (ids.length === 0) break;
    await markEmailsRead(accessToken, ids);
    total += ids.length;
    pageToken = nextPageToken;
  } while (pageToken && total < 10000);
  return total;
}

function gmailFetch(accessToken: string, path: string, init?: RequestInit) {
  return fetch(`${GMAIL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });
}

/** gmailFetch that retries 429 / 5xx with backoff — the burst rate-limit
 *  failures that otherwise make list rows come back with no sender/subject. */
async function gmailFetchOk(
  accessToken: string,
  path: string,
  init?: RequestInit,
  attempts = 4,
): Promise<Response> {
  let res = await gmailFetch(accessToken, path, init);
  for (let i = 1; i < attempts; i++) {
    if (res.ok || (res.status !== 429 && res.status < 500)) return res;
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (i - 1)));
    res = await gmailFetch(accessToken, path, init);
  }
  return res;
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}
