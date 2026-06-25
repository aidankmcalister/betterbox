import { auth } from "@/lib/auth";
import { getGmailSignature } from "@/lib/gmail/api.server";
import { getGoogleToken } from "@/lib/gmail/accounts.server";
import { json } from "@/lib/json-response";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/gmail-signature")({
  server: {
    handlers: {
      /** The account's native Gmail signature HTML (set in Gmail Settings,
       *  images and all). ?accountId picks which linked Google account; ?email
       *  picks the matching send-as identity. Empty when unset or unauthorized
       *  (e.g. the gmail.settings.basic scope hasn't been granted yet). */
      GET: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const url = new URL(request.url);
        const accountId = url.searchParams.get("accountId") ?? undefined;
        const email = url.searchParams.get("email") ?? undefined;
        const accessToken = await getGoogleToken(
          request.headers,
          session.user.id,
          accountId,
        );
        if (!accessToken) return json({ signature: "" });

        try {
          return json({ signature: await getGmailSignature(accessToken, email) });
        } catch {
          return json({ signature: "" });
        }
      },
    },
  },
});
