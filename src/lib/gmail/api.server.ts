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

/** One page of recent messages with subject/from/date metadata. */
export async function listRecentEmails(
  accessToken: string,
  max = 50,
  pageToken?: string,
): Promise<{ emails: Email[]; nextPageToken?: string }> {
  const { ids, nextPageToken } = await listMessageIds(accessToken, max, pageToken);
  const emails = await Promise.all(ids.map((id) => fetchEmail(accessToken, id)));
  return { emails, nextPageToken };
}

async function listMessageIds(
  accessToken: string,
  max: number,
  pageToken?: string,
): Promise<{ ids: string[]; nextPageToken?: string }> {
  const query =
    `/messages?maxResults=${max}` +
    (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
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
  const res = await gmailFetch(
    accessToken,
    `/messages/${id}?format=metadata&${headers}`,
  );
  const message = (await res.json()) as {
    snippet?: string;
    labelIds?: string[];
    payload?: { headers?: { name: string; value: string }[] };
  };
  const header = (name: string) =>
    message.payload?.headers?.find((h) => h.name === name)?.value ?? "";

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
  body: string;
};

type MessagePart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: MessagePart[];
};

/** One full message: headers + a plain-text body (format=full). */
export async function getFullEmail(
  accessToken: string,
  id: string,
): Promise<FullEmail> {
  const res = await gmailFetch(accessToken, `/messages/${id}?format=full`);
  if (!res.ok) throw new Error(`Gmail get failed (${res.status})`);
  const message = (await res.json()) as {
    snippet?: string;
    labelIds?: string[];
    payload?: MessagePart & { headers?: { name: string; value: string }[] };
  };
  const header = (name: string) =>
    message.payload?.headers?.find(
      (h) => h.name.toLowerCase() === name.toLowerCase(),
    )?.value ?? "";

  return {
    id,
    from: header("From"),
    to: header("To"),
    subject: header("Subject"),
    date: header("Date"),
    messageId: header("Message-ID"),
    snippet: message.snippet,
    unread: message.labelIds?.includes("UNREAD") ?? false,
    body: extractBody(message.payload),
  };
}

/** Prefer text/plain; fall back to tag-stripped text/html. */
function extractBody(payload?: MessagePart): string {
  if (!payload) return "";
  const plain = findPart(payload, "text/plain");
  if (plain) return decodePart(plain);
  const html = findPart(payload, "text/html");
  if (html) return stripHtml(decodePart(html));
  return "";
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
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
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

/** Send a plain-text message from the token's own address (messages.send). */
export async function sendEmail(
  accessToken: string,
  options: { to: string; subject: string; body: string },
): Promise<void> {
  const from = await getEmailAddress(accessToken);
  if (!from) throw new Error("Could not resolve sender address");

  const mime = [
    `From: ${from}`,
    `To: ${options.to}`,
    `Subject: ${encodeSubject(options.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    options.body,
  ].join("\r\n");

  const res = await gmailFetch(accessToken, "/messages/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }),
  });
  if (!res.ok) throw new Error(`Gmail send failed (${res.status})`);
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

function gmailFetch(accessToken: string, path: string, init?: RequestInit) {
  return fetch(`${GMAIL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });
}
