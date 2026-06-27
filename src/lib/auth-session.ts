import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { auth } from "@/lib/auth";

/**
 * Server-resolved session for route guards. Called from _app's beforeLoad so SSR
 * knows sign-in state — the authenticated shell never flashes before the landing
 * page (or vice versa). On the client it's an RPC; useSession() then takes over
 * for live updates (sign-out, account linking).
 */
export const fetchSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    return session ?? null;
  },
);

export type ServerSession = Awaited<ReturnType<typeof fetchSession>>;

/**
 * Whether Google OAuth is configured. A fresh self-host has no GOOGLE_CLIENT_ID/
 * SECRET yet, so the sign-in page checks this to show setup guidance instead of a
 * button that throws an opaque 500 mid-flow.
 */
export const fetchGoogleConfigured = createServerFn({ method: "GET" }).handler(
  () =>
    Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
    ),
);
