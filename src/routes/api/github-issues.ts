import { auth } from "@/lib/auth";
import { fetchGithubIssues, getGithubToken } from "@/lib/github/github.server";
import { json, jsonError } from "@/lib/json-response";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/github-issues")({
  server: {
    handlers: {
      /** Open issues for the linked GitHub account.
       *  → { linked: false } when GitHub isn't linked yet. */
      GET: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return json({ error: "Not signed in" }, 401);

        const token = await getGithubToken(request.headers, session.user.id);
        if (!token) return json({ linked: false });

        try {
          const { login, issues } = await fetchGithubIssues(token);
          return json({ linked: true, login, issues });
        } catch (error) {
          return jsonError("GET /api/github-issues", error, 502, {
            linked: true,
          });
        }
      },
    },
  },
});
