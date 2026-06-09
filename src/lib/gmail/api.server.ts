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

/** Most recent `max` messages with their subject/from/date metadata. */
export async function listRecentEmails(
  accessToken: string,
  max = 50,
): Promise<Email[]> {
  const ids = await listMessageIds(accessToken, max);
  return Promise.all(ids.map((id) => fetchEmail(accessToken, id)));
}

async function listMessageIds(
  accessToken: string,
  max: number,
): Promise<string[]> {
  const res = await gmailFetch(accessToken, `/messages?maxResults=${max}`);
  if (!res.ok) throw new Error(`Gmail list failed (${res.status})`);
  const { messages = [] } = (await res.json()) as {
    messages?: { id: string }[];
  };
  return messages.map((message) => message.id);
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

function gmailFetch(accessToken: string, path: string) {
  return fetch(`${GMAIL}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}
