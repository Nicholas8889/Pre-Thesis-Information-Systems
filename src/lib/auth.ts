import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

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

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const digest = createHash("sha256")
    .update(`${salt}:${password}`)
    .digest("hex");

  return `${salt}:${digest}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [salt, digest] = passwordHash.split(":");

  if (!salt || !digest) {
    return false;
  }

  const candidate = hashPassword(password, salt).split(":")[1];
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
