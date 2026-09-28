import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signSession } from "../../src/lib/session-token";
import { resolveSessionUser } from "../../src/lib/session";

const originalAuthSecret = process.env.AUTH_SECRET;

describe("session user resolution", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-auth-secret-that-is-long-enough-for-session-signing";
  });

  afterEach(() => {
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
  });

  async function token(overrides: Partial<{
    username: string;
    role: "ADMIN" | "SALES" | "MANAGER";
    sessionVersion: number;
  }> = {}) {
    return signSession({
      userId: "user-1",
      username: overrides.username ?? "sit_admin",
      role: overrides.role ?? "ADMIN",
      sessionVersion: overrides.sessionVersion ?? 3,
      exp: Math.floor(Date.now() / 1000) + 60
    });
  }

  function db(user: object | null) {
    return {
      user: { findUnique: vi.fn().mockResolvedValue(user) }
    } as never;
  }

  const activeUser = {
    id: "user-1",
    username: "sit_admin",
    displayName: "SIT Admin",
    role: "ADMIN",
    status: "Active",
    sessionVersion: 3
  };

  it("returns an active user when every signed claim matches current state", async () => {
    await expect(resolveSessionUser(await token(), db(activeUser))).resolves.toEqual(activeUser);
  });

  it.each([
    { ...activeUser, status: "Inactive" },
    { ...activeUser, role: "SALES" },
    { ...activeUser, username: "renamed" },
    { ...activeUser, sessionVersion: 4 },
    null
  ])("rejects revoked or stale current state %#", async currentState => {
    await expect(resolveSessionUser(await token(), db(currentState))).resolves.toBeNull();
  });

  it("rejects an invalid token before querying the database", async () => {
    const reader = db(activeUser) as { user: { findUnique: ReturnType<typeof vi.fn> } };
    await expect(resolveSessionUser("broken.token", reader as never)).resolves.toBeNull();
    expect(reader.user.findUnique).not.toHaveBeenCalled();
  });
});
