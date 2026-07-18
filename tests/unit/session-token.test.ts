import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signSession, verifySignedSession } from "../../src/lib/session-token";

const originalAuthSecret = process.env.AUTH_SECRET;

describe("signed session tokens", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-auth-secret-that-is-long-enough-for-session-signing";
  });

  afterEach(() => {
    if (originalAuthSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalAuthSecret;
    }
  });

  it("verifies a valid signed session", async () => {
    const token = await signSession({
      userId: "user-1",
      username: "admin",
      role: "ADMIN",
      exp: Math.floor(Date.now() / 1000) + 60
    });

    await expect(verifySignedSession(token)).resolves.toMatchObject({
      userId: "user-1",
      username: "admin",
      role: "ADMIN"
    });
  });

  it("rejects altered and expired sessions", async () => {
    const expired = await signSession({
      userId: "user-1",
      username: "admin",
      role: "ADMIN",
      exp: Math.floor(Date.now() / 1000) - 1
    });
    const valid = await signSession({
      userId: "user-1",
      username: "admin",
      role: "ADMIN",
      exp: Math.floor(Date.now() / 1000) + 60
    });

    await expect(verifySignedSession(expired)).resolves.toBeNull();
    await expect(verifySignedSession(`${valid}tampered`)).resolves.toBeNull();
  });
});
