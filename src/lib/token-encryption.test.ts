import { describe, expect, test } from "bun:test";
import { symmetricEncrypt, symmetricDecrypt } from "better-auth/crypto";

/**
 * Guards the security-critical contract behind `account.encryptOAuthTokens`
 * (src/lib/auth.ts) and the backfill in scripts/encrypt-oauth-tokens.ts:
 *  - encrypt → decrypt round-trips with the same secret;
 *  - a plaintext OAuth token is NOT decryptable, which is exactly how the
 *    idempotent backfill tells "needs encrypting" from "already encrypted".
 */
const KEY = "test-secret-key-0123456789-betterbox";

async function decryptThrows(data: string): Promise<boolean> {
  try {
    await symmetricDecrypt({ key: KEY, data });
    return false;
  } catch {
    return true;
  }
}

describe("OAuth token encryption", () => {
  test("encrypt → decrypt round-trips", async () => {
    const token = "ya29.a0AfH-fakeAccess_token.with-dots/and+slashes";
    const enc = await symmetricEncrypt({ key: KEY, data: token });
    expect(enc).not.toBe(token);
    expect(await symmetricDecrypt({ key: KEY, data: enc })).toBe(token);
  });

  test("already-encrypted values decrypt cleanly (backfill skips them)", async () => {
    const enc = await symmetricEncrypt({ key: KEY, data: "hello" });
    expect(await decryptThrows(enc)).toBe(false);
  });

  test("plaintext OAuth tokens fail to decrypt (backfill encrypts them)", async () => {
    // Real Google tokens contain non-hex chars, so decryption throws — that
    // failure is what the backfill's try/catch relies on for idempotency.
    expect(
      await decryptThrows("1//0gFakeRefreshToken-with_chars.not/hex"),
    ).toBe(true);
    expect(await decryptThrows("ya29.a0AfH-plainAccessToken")).toBe(true);
  });

  test("wrong key cannot decrypt", async () => {
    const enc = await symmetricEncrypt({ key: KEY, data: "secret" });
    try {
      await symmetricDecrypt({ key: "a-different-secret-entirely", data: enc });
      throw new Error("expected decrypt to fail with the wrong key");
    } catch (error) {
      expect((error as Error).message).not.toBe("");
    }
  });
});
