import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const signIn = () => authClient.signIn.social({ provider: "google" });

// Attach another Gmail account to the signed-in user.
export const linkGoogle = () =>
  authClient.linkSocial({
    provider: "google",
    scopes: ["https://www.googleapis.com/auth/gmail.modify"],
  });

export const { signOut, useSession } = authClient;
