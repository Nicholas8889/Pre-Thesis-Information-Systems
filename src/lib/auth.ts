import bcrypt from "bcryptjs";
import { createHash, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE_NAME = "cv_tajuk_session";
export const DEMO_USERNAME = "admin";
export const DEMO_PASSWORD = "Admin123!";

const roleLabels: Record<string, string> = {
  ADMIN: "Admin",
  SALES: "Sales",
  MANAGER: "Manager",
  Admin: "Admin",
  Sales: "Sales",
  GeneralManager: "Manager",
  MN: "Manager",
  Staff: "Sales"
};

export function hashPassword(password: string) {
  return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password: string, passwordHash: string) {
  if (passwordHash.startsWith("$2")) {
    try {
      return bcrypt.compareSync(password, passwordHash);
    } catch {
      return false;
    }
  }

  return verifyLegacyPassword(password, passwordHash);
}

export function needsPasswordRehash(passwordHash: string) {
  if (!passwordHash.startsWith("$2")) return true;

  try {
    return bcrypt.getRounds(passwordHash) < 12;
  } catch {
    return true;
  }
}

function verifyLegacyPassword(password: string, passwordHash: string) {
  const [salt, digest] = passwordHash.split(":");

  if (!salt || !digest) {
    return false;
  }

  const candidate = createHash("sha256")
    .update(`${salt}:${password}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(digest, "hex");
  const candidateBuffer = Buffer.from(candidate, "hex");

  return (
    expectedBuffer.length === candidateBuffer.length &&
    timingSafeEqual(expectedBuffer, candidateBuffer)
  );
}

export function roleLabel(role: string) {
  return roleLabels[role] ?? role;
}
