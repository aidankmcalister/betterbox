import { tanstackStartCookies } from "better-auth/tanstack-start";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./prisma.server";

// Sign-in allowlist. Comma-separated emails in ALLOWED_EMAILS may create an
// account; everyone else is rejected at account creation. Empty or unset means
// open (convenient for local dev). Existing users are unaffected: this only
// gates first-time account creation, not subsequent sign-ins.
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
      scope: ["https://www.googleapis.com/auth/gmail.modify"],
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
  },
  user: {
    additionalFields: {
      // Surfaced on session.user. input:false means a client can never set its
      // own role at sign-up/update — owner is granted out-of-band (DB / script).
      role: {
        type: "string",
        required: false,
        defaultValue: "USER",
        input: false,
      },
    },
  },
  account: {
    // Encrypt OAuth access/refresh/id tokens at rest with BETTER_AUTH_SECRET.
    // Reads stay backward-compatible: better-auth returns plaintext rows
    // untouched and decrypts encrypted ones, so existing accounts keep working
    // until a refresh (or the backfill script) rewrites them encrypted.
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
        // Reject account creation for any email not on ALLOWED_EMAILS. Runs
        // after Google OAuth but before the user row is written, so a
        // non-allowlisted account is never created and no session is issued.
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
