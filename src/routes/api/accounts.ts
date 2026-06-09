import { auth } from "@/lib/auth";
import { getEmailAddress } from "@/lib/gmail/api.server";
import { getGoogleToken, listGoogleAccounts } from "@/lib/gmail/accounts.server";
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
            return {
              accountId: account.accountId,
              email: token ? await getEmailAddress(token) : "",
            };
          }),
        );

        return json({ count: result.length, accounts: result });
      },
    },
  },
});
