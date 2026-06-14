import { auth } from "@/lib/auth";
import { listContacts } from "@/lib/gmail/api.server";
import { getGoogleToken } from "@/lib/gmail/accounts.server";
import { json } from "@/lib/json-response";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/contacts")({
  server: {
    handlers: {
      /** People the signed-in account has emailed before (compose autocomplete).
       *  ?accountId=… picks which linked Google account to read Sent from. */
      GET: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const accountId =
          new URL(request.url).searchParams.get("accountId") ?? undefined;
        const accessToken = await getGoogleToken(
          request.headers,
          session.user.id,
          accountId,
        );
        if (!accessToken) return json({ contacts: [] });

        try {
          return json({ contacts: await listContacts(accessToken) });
        } catch {
          return json({ contacts: [] });
        }
      },
    },
  },
});
