import { tanstackStartCookies } from "better-auth/tanstack-start";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./prisma.server";

// Sign-in allowlist: comma-separated ALLOWED_EMAILS may create an account; others
// are rejected at creation. Empty/unset = open (local dev). Gates first-time
// account creation only, not subsequent sign-ins — existing users unaffected.
const ALLOWED_EMAILS = new Set(
  (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  baseURL: process.env.BETTER_AUTH_URL,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      accessType: "offline",
      prompt: "select_account consent",
      scope: [
        "https://www.googleapis.com/auth/gmail.modify",
        // Read the account's native Gmail signature (per send-as identity),
        // images and all — we mirror it rather than build our own.
        "https://www.googleapis.com/auth/gmail.settings.basic",
      ],
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
  },
  user: {
    additionalFields: {
      // Surfaced on session.user. input:false: a client can never set its own
      // role at sign-up/update — owner is granted out-of-band (DB / script).
      role: {
        type: "string",
        required: false,
        defaultValue: "USER",
        input: false,
      },
    },
  },
  account: {
    // Encrypt OAuth tokens at rest with BETTER_AUTH_SECRET. Reads stay
    // backward-compatible: better-auth returns plaintext rows untouched and
    // decrypts encrypted ones, so existing accounts work until a refresh (or the
    // backfill script) rewrites them encrypted.
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "github"],
      allowDifferentEmails: true, // let a second, different Gmail (or GitHub) link
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Reject creation for any email not on ALLOWED_EMAILS. Runs after Google
        // OAuth but before the user row is written, so a non-allowlisted account
        // is never created and no session issued.
        before: async (user) => {
          if (
            ALLOWED_EMAILS.size > 0 &&
            !ALLOWED_EMAILS.has(user.email.toLowerCase())
          ) {
            throw new APIError("FORBIDDEN", {
              message: "This account isn't on the access list yet.",
            });
          }
        },
      },
    },
  },
  plugins: [tanstackStartCookies()],
});
