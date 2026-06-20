import { auth } from "@/lib/auth";
import { getEmailAddress, getInboxUnread } from "@/lib/gmail/api.server";
import {
  getGoogleToken,
  listGoogleAccounts,
} from "@/lib/gmail/accounts.server";
import { json } from "@/lib/json-response";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/accounts")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        // Every Google account row for the user — including the primary one
        // they signed in with (Better Auth's listUserAccounts returns all rows,
        // not just linkGoogle() additions), so the primary inbox shows up on a
        // fresh sign-in like any other.
        const accounts = await listGoogleAccounts(request.headers);
        const result = await Promise.all(
          accounts.map(async (account) => {
            try {
              const token = await getGoogleToken(
                request.headers,
                session.user.id,
                account.accountId,
              );
              if (!token) {
                return { accountId: account.accountId, email: "", unread: 0 };
              }
              const [email, unread] = await Promise.all([
                getEmailAddress(token),
                getInboxUnread(token),
              ]);
              return { accountId: account.accountId, email, unread };
            } catch {
              // A single account failing to resolve (token refresh hiccup,
              // transient Gmail error) must not blank the whole list — surface
              // it with an empty email instead of throwing and 500-ing, which
              // would leave the user with zero accounts.
              return { accountId: account.accountId, email: "", unread: 0 };
            }
          }),
        );

        // Put the signed-in (primary) account first so it's the default inbox,
        // ahead of any accounts added later via "Add Google account".
        const primaryEmail = session.user.email?.toLowerCase();
        result.sort((a, b) => {
          const aPrimary = a.email.toLowerCase() === primaryEmail ? 0 : 1;
          const bPrimary = b.email.toLowerCase() === primaryEmail ? 0 : 1;
          return aPrimary - bPrimary;
        });

        return json({ count: result.length, accounts: result });
      },
    },
  },
});
