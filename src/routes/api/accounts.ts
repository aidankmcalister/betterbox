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

        const accounts = await listGoogleAccounts(request.headers);
        const result = await Promise.all(
          accounts.map(async (account) => {
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
          }),
        );

        return json({ count: result.length, accounts: result });
      },
    },
  },
});
