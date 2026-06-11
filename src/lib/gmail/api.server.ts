const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const METADATA_HEADERS = ["Subject", "From", "Date"];

export type Email = {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet?: string;
  unread?: boolean;
};

/** The Gmail address this token belongs to (handy for labeling accounts). */
export async function getEmailAddress(accessToken: string): Promise<string> {
  const res = await gmailFetch(accessToken, "/profile");
  if (!res.ok) return "";
  const { emailAddress } = (await res.json()) as { emailAddress?: string };
  return emailAddress ?? "";
}

/** Number of unread messages in this account's inbox. */
export async function getInboxUnread(accessToken: string): Promise<number> {
  const res = await gmailFetch(accessToken, "/labels/INBOX");
  if (!res.ok) return 0;
  const { messagesUnread } = (await res.json()) as { messagesUnread?: number };
  return messagesUnread ?? 0;
}

/** One page of recent messages with subject/from/date metadata, filtered by a
 *  Gmail query (the mailbox folder). */
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

/** Gmail full-text search (messages.list q=) as metadata rows. */
export async function searchEmails(
  accessToken: string,
  q: string,
  max = 8,
): Promise<Email[]> {
  const { ids } = await listMessageIds(accessToken, max, undefined, q);
  return mapPool(ids, 8, (id) => fetchEmail(accessToken, id));
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
    return { id, from: "", subject: "(couldn’t load)", date: "", unread: false };
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
  };
}

export type FullEmail = Email & {
  to: string;
  messageId: string;
  /** Gmail thread id + References chain — used to thread replies. */
  threadId: string;
  references: string;
  starred: boolean;
  body: string;
  bodyHtml?: string;
};

type MessagePart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: MessagePart[];
};

type RawMessage = {
  id?: string;
  snippet?: string;
  labelIds?: string[];
  threadId?: string;
  payload?: MessagePart & { headers?: { name: string; value: string }[] };
};

/** Parse one Gmail message resource (format=full) into a FullEmail. */
function parseMessage(message: RawMessage): FullEmail {
  const header = (name: string) =>
    message.payload?.headers?.find(
      (h) => h.name.toLowerCase() === name.toLowerCase(),
    )?.value ?? "";

  return {
    id: message.id ?? "",
    from: header("From"),
    to: header("To"),
    subject: header("Subject"),
    date: header("Date"),
    messageId: header("Message-ID"),
    threadId: message.threadId ?? "",
    references: header("References"),
    starred: message.labelIds?.includes("STARRED") ?? false,
    snippet: message.snippet,
    unread: message.labelIds?.includes("UNREAD") ?? false,
    ...extractBody(message.payload),
  };
}

/** One full message: headers + plain-text and HTML bodies (format=full). */
export async function getFullEmail(
  accessToken: string,
  id: string,
): Promise<FullEmail> {
  const res = await gmailFetch(accessToken, `/messages/${id}?format=full`);
  if (!res.ok) throw new Error(`Gmail get failed (${res.status})`);
  return parseMessage(await res.json());
}

/** Every message in a conversation, oldest first (threads.get?format=full). */
export async function getThread(
  accessToken: string,
  threadId: string,
): Promise<FullEmail[]> {
  const res = await gmailFetch(accessToken, `/threads/${threadId}?format=full`);
  if (!res.ok) throw new Error(`Gmail thread get failed (${res.status})`);
  const data = (await res.json()) as { messages?: RawMessage[] };
  return (data.messages ?? []).map(parseMessage);
}

/** Plain text (exports, fallback) plus the HTML part when one exists. */
function extractBody(payload?: MessagePart): {
  body: string;
  bodyHtml?: string;
} {
  if (!payload) return { body: "" };
  const html = findPart(payload, "text/html");
  const bodyHtml = html ? decodePart(html) : undefined;
  const plain = findPart(payload, "text/plain");
  const body = plain
    ? decodePart(plain)
    : bodyHtml
      ? stripHtml(bodyHtml)
      : "";
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
  return html
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
    .trim();
}

/** Full RFC 822 source of one message (format=raw, decoded). */
export async function getRawEmail(
  accessToken: string,
  id: string,
): Promise<string> {
  const res = await gmailFetch(accessToken, `/messages/${id}?format=raw`);
  if (!res.ok) throw new Error(`Gmail get failed (${res.status})`);
  const { raw = "" } = (await res.json()) as { raw?: string };
  return Buffer.from(raw, "base64url").toString("utf8");
}

/** Send a plain-text message from the token's own address (messages.send).
 *  Pass inReplyTo/references/threadId to thread it as a real reply. */
export async function sendEmail(
  accessToken: string,
  options: {
    to: string;
    subject: string;
    body: string;
    inReplyTo?: string;
    references?: string;
    threadId?: string;
  },
): Promise<void> {
  const from = await getEmailAddress(accessToken);
  if (!from) throw new Error("Could not resolve sender address");

  const headerLines = [
    `From: ${from}`,
    `To: ${options.to}`,
    `Subject: ${encodeSubject(options.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
  ];
  // Threading headers make Gmail (and every other client) nest the reply
  // under the original conversation instead of starting a new one.
  if (options.inReplyTo) headerLines.push(`In-Reply-To: ${options.inReplyTo}`);
  if (options.references) headerLines.push(`References: ${options.references}`);

  const mime = [...headerLines, "", options.body].join("\r\n");
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

/** A single-message action: archive (un-inbox), trash, or toggle star. */
export type MessageAction = "archive" | "trash" | "star" | "unstar";

/** Apply a message action via messages.modify / messages.trash. */
export async function actOnEmail(
  accessToken: string,
  id: string,
  action: MessageAction,
): Promise<void> {
  const path =
    action === "trash"
      ? `/messages/${id}/trash`
      : `/messages/${id}/modify`;
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

/** Remove the UNREAD label from up to 1000 messages (batchModify). */
export async function markEmailsRead(
  accessToken: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const res = await gmailFetch(accessToken, "/messages/batchModify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids: ids.slice(0, 1000), removeLabelIds: ["UNREAD"] }),
  });
  if (!res.ok) throw new Error(`Gmail batchModify failed (${res.status})`);
}

/** Mark the whole account read: page through every is:unread message and
 *  batchModify it (capped so a runaway mailbox can't hang the request). */
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

/** Async map with bounded concurrency — don't fire 50 gets at once. */
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
