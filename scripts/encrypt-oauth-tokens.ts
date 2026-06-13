/**
 * One-time backfill: encrypt OAuth tokens already sitting in the `account`
 * table as plaintext.
 *
 * Enabling `account.encryptOAuthTokens` in src/lib/auth.ts only encrypts tokens
 * written from that point on. Existing rows stay plaintext until a token
 * refresh rewrites them. This script closes that gap immediately.
 *
 * It is idempotent: for each token it first tries to decrypt. A successful
 * decrypt means the value is already encrypted, so it is skipped. A failed
 * decrypt means the value is plaintext, so it gets encrypted and written back.
 * That makes double-encryption impossible even if the script is re-run.
 *
 * Run with: bun --env-file=.env scripts/encrypt-oauth-tokens.ts
 */
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import prisma from "../src/lib/prisma.server";

const secret = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || "";

if (!secret) {
  throw new Error(
    "BETTER_AUTH_SECRET is required to encrypt tokens (run with --env-file=.env)",
  );
}

const TOKEN_FIELDS = ["accessToken", "refreshToken", "idToken"] as const;
type TokenField = (typeof TOKEN_FIELDS)[number];

/** True if the value can be decrypted with our secret (i.e. already encrypted). */
async function isAlreadyEncrypted(value: string): Promise<boolean> {
  try {
    await symmetricDecrypt({ key: secret, data: value });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const accounts = await prisma.account.findMany({
    select: {
      id: true,
      providerId: true,
      accessToken: true,
      refreshToken: true,
      idToken: true,
    },
  });

  console.log(`Scanning ${accounts.length} account row(s)…`);

  let rowsUpdated = 0;
  let tokensEncrypted = 0;
  let tokensSkipped = 0;

  for (const account of accounts) {
    const updates: Partial<Record<TokenField, string>> = {};

    for (const field of TOKEN_FIELDS) {
      const value = account[field];
      if (!value) continue;

      if (await isAlreadyEncrypted(value)) {
        tokensSkipped++;
        continue;
      }

      updates[field] = await symmetricEncrypt({ key: secret, data: value });
      tokensEncrypted++;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.account.update({ where: { id: account.id }, data: updates });
      rowsUpdated++;
      console.log(
        `  ↳ ${account.providerId} (${account.id}): encrypted ${Object.keys(
          updates,
        ).join(", ")}`,
      );
    }
  }

  console.log(
    `Done. ${tokensEncrypted} token(s) encrypted across ${rowsUpdated} row(s); ` +
      `${tokensSkipped} already encrypted.`,
  );
}

main()
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
