/** A connected Gmail account as returned by GET /api/accounts. */
export type Account = {
  accountId: string;
  email: string;
  unread: number;
};
