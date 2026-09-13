import { existsSync, readFileSync } from "node:fs";

const requiredFiles = ["Dockerfile", ".dockerignore", "docker-compose.yml", "docs/DEPLOYMENT.md", ".env.example"];

const missing = requiredFiles.filter((file) => !existsSync(file));
if (missing.length > 0) {
  throw new Error(`Missing deployment files: ${missing.join(", ")}`);
}

const dockerfile = readFileSync("Dockerfile", "utf8");
const compose = readFileSync("docker-compose.yml", "utf8");
const envExample = readFileSync(".env.example", "utf8");
const packageJson = readFileSync("package.json", "utf8");

const checks: Array<[string, boolean]> = [
  ["Dockerfile uses Node 22", dockerfile.includes("node:22")],
  ["Dockerfile exposes port 3000", dockerfile.includes("EXPOSE 3000")],
  ["Dockerfile runs non-root user", dockerfile.includes("USER nextjs")],
  ["Dockerfile avoids image-level healthcheck (web-only healthchecks)", !/^HEALTHCHECK/m.test(dockerfile)],
  ["Dockerfile does not copy .env files", !/COPY.*\.env(\s|$)/m.test(dockerfile)],
  ["Compose defines web service", compose.includes("web:") && compose.includes("npm run start:web")],
  ["Compose defines web healthcheck", compose.includes("/api/health")],
  ["Compose defines worker service", compose.includes("worker:") && compose.includes("npm run start:worker")],
  ["Compose defines scheduler service", compose.includes("scheduler:") && compose.includes("npm run start:scheduler")],
  ["Compose defines PostgreSQL", compose.includes("postgres:") && compose.includes("postgres:17-alpine")],
  ["Compose defines Redis with persistence", compose.includes("redis:") && compose.includes("redis:7-alpine") && compose.includes("--appendonly yes")],
  ["Package defines start:web", packageJson.includes('"start:web"')],
  ["Package defines start:worker", packageJson.includes('"start:worker"')],
  ["Package defines start:scheduler", packageJson.includes('"start:scheduler"')],
  ["Package defines deploy:migrate", packageJson.includes('"deploy:migrate"')],
  ["Env example documents Redis", envExample.includes("REDIS_URL=")],
  ["Env example documents Meta provider", envExample.includes("META_PROVIDER=")],
  ["Env example documents sync tuning", envExample.includes("META_SYNC_CONCURRENCY=") && envExample.includes("BACKFILL_CHUNK_DAYS=")],
  ["Env example documents analytics source", envExample.includes("ANALYTICS_SOURCE=")]
];

const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length > 0) {
  throw new Error(`Deployment readiness checks failed: ${failed.join("; ")}`);
}

console.log(`Deployment readiness checks passed (${checks.length}/${checks.length})`);
