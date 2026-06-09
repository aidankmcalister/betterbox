import { auth } from "../auth";

/** All Google accounts linked to the signed-in user. */
export async function listGoogleAccounts(headers: Headers) {
  const accounts = await auth.api.listUserAccounts({ headers });
  return accounts.filter((a) => a.providerId === "google");
}

/**
 * Fresh access token for one Google account. Pass `accountId` (the provider's
 * account id, i.e. Google's `sub` — the `accountId` column, not the record id)
 * to pick a specific linked account; omit it to use the user's default Google
 * account. Auto-refreshes via the stored refresh token.
 */
export async function getGoogleToken(
  headers: Headers,
  userId: string,
  accountId?: string,
) {
  const { accessToken } = await auth.api.getAccessToken({
    body: { providerId: "google", userId, ...(accountId ? { accountId } : {}) },
    headers,
  });
  return accessToken;
}
