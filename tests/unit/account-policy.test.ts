import { describe, expect, it } from "vitest";
import {
  canonicalizeUsername,
  validateDisplayName,
  validatePassword,
  validateUsername
} from "../../src/lib/account-policy";
import { canAuthenticateUser, hashPassword } from "../../src/lib/auth";

describe("account policy", () => {
  it("canonicalizes usernames with trim and lowercase", () => {
    expect(canonicalizeUsername("  SIT_User.A  ")).toBe("sit_user.a");
    expect(validateUsername("  SIT_User.A  ")).toBe("sit_user.a");
  });

  it("rejects empty and unsafe usernames", () => {
    expect(() => validateUsername("   ")).toThrow("required");
    expect(() => validateUsername("user name")).toThrow("only contain");
  });

  it("validates display names and password boundaries", () => {
    expect(validateDisplayName("  SIT Admin  ")).toBe("SIT Admin");
    expect(validatePassword("12345678")).toBe("12345678");
    expect(() => validatePassword("short")).toThrow("between 8 and 128");
    expect(() => validatePassword("x".repeat(129))).toThrow("between 8 and 128");
  });

  it("only authenticates an Active account with the correct password", () => {
    const passwordHash = hashPassword("SIT-Password-123!");
    expect(canAuthenticateUser({ status: "Active", passwordHash }, "SIT-Password-123!")).toBe(true);
    expect(canAuthenticateUser({ status: "Inactive", passwordHash }, "SIT-Password-123!")).toBe(false);
    expect(canAuthenticateUser({ status: "Active", passwordHash }, "wrong-password")).toBe(false);
    expect(canAuthenticateUser(null, "SIT-Password-123!")).toBe(false);
  });
});
