import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { auth } from "@/lib/auth";

/**
 * Server-resolved session for route guards. Called from the _app route's
 * beforeLoad so SSR already knows whether the visitor is signed in — the
 * authenticated shell never flashes before the landing page (and vice versa).
 * On the client it runs as an RPC; useSession() then takes over for live
 * updates (sign-out, account linking).
 */
export const fetchSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    return session ?? null;
  },
);

export type ServerSession = Awaited<ReturnType<typeof fetchSession>>;
