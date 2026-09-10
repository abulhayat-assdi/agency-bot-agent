import { existsSync, readFileSync } from "node:fs";

const requiredFiles = ["Dockerfile", ".dockerignore", "docker-compose.yml", "docs/DEPLOYMENT.md", ".env.example"];

const missing = requiredFiles.filter((file) => !existsSync(file));
if (missing.length > 0) {
  throw new Error(`Missing deployment files: ${missing.join(", ")}`);
}

const dockerfile = readFileSync("Dockerfile", "utf8");
const compose = readFileSync("docker-compose.yml", "utf8");
const envExample = readFileSync(".env.example", "utf8");

const checks: Array<[string, boolean]> = [
  ["Dockerfile uses Node 22", dockerfile.includes("node:22")],
  ["Dockerfile exposes port 3000", dockerfile.includes("EXPOSE 3000")],
  ["Dockerfile has healthcheck", dockerfile.includes("HEALTHCHECK") && dockerfile.includes("/api/health")],
  ["Dockerfile runs non-root user", dockerfile.includes("USER nextjs")],
  ["Compose defines web service", compose.includes("web:") && compose.includes("npm run start:web")],
  ["Compose defines worker service", compose.includes("worker:") && compose.includes("npm run start:worker")],
  ["Compose defines PostgreSQL", compose.includes("postgres:") && compose.includes("postgres:17-alpine")],
  ["Compose defines Redis", compose.includes("redis:") && compose.includes("redis:7-alpine")],
  ["Env example documents Redis", envExample.includes("REDIS_URL=")],
  ["Env example documents Meta provider", envExample.includes("META_PROVIDER=")]
];

const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length > 0) {
  throw new Error(`Deployment readiness checks failed: ${failed.join("; ")}`);
}

console.log(`Deployment readiness checks passed (${checks.length}/${checks.length})`);
