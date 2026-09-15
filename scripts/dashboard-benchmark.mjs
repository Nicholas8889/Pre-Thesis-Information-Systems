import { createHmac } from "node:crypto";
import { performance } from "node:perf_hooks";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ path: ".env.local" });
config();

const baseURL = new URL(process.env.DASHBOARD_BASE_URL || "http://127.0.0.1:3107");
if (!["127.0.0.1", "localhost"].includes(baseURL.hostname)) {
  throw new Error("Dashboard benchmark only accepts a local server URL");
}
if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is required");
const samples = Number(process.env.DASHBOARD_BENCHMARK_SAMPLES || "7");
if (!Number.isInteger(samples) || samples < 3 || samples > 30) {
  throw new Error("DASHBOARD_BENCHMARK_SAMPLES must be an integer between 3 and 30");
}

function token(user) {
  const payload = Buffer.from(JSON.stringify({
    userId: user.id, username: user.username, role: user.role,
    exp: Math.floor(Date.now() / 1000) + 3600
  })).toString("base64url");
  const signature = createHmac("sha256", process.env.AUTH_SECRET)
    .update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function percentile(sorted, fraction) {
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

async function measure(user) {
  const times = [];
  const expected = `${user.role === "ADMIN" ? "Admin" : user.role === "MANAGER" ? "Manager" : "Sales"} Dashboard`;
  for (let index = -1; index < samples; index++) {
    const start = performance.now();
    const response = await fetch(baseURL, {
      headers: { Cookie: `cv_tajuk_session=${token(user)}`, Accept: "text/html" },
      cache: "no-store"
    });
    const html = await response.text();
    const elapsed = performance.now() - start;
    if (!response.ok || !html.includes(expected)) {
      throw new Error(`Benchmark received an unexpected ${response.status} response for ${user.role}`);
    }
    if (index >= 0) times.push(Math.round(elapsed));
  }
  times.sort((a, b) => a - b);
  return { role: user.role, samples, medianMs: percentile(times, 0.5), p95Ms: percentile(times, 0.95), minMs: times[0], maxMs: times.at(-1) };
}

const db = new PrismaClient();
try {
  const users = await db.user.findMany({
    where: { status: "Active", role: { in: ["ADMIN", "MANAGER", "SALES"] } },
    select: { id: true, username: true, role: true }
  });
  const chosen = ["ADMIN", "MANAGER", "SALES"]
    .map((role) => users.find((user) => user.role === role));
  if (chosen.some((user) => !user)) throw new Error("Benchmark needs one active user per role");
  const results = [];
  for (const user of chosen) results.push(await measure(user));
  process.stdout.write(JSON.stringify({ measuredAt: new Date().toISOString(), baseURL: baseURL.origin, results }, null, 2) + "\n");
} finally {
  await db.$disconnect();
}
