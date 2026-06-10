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
