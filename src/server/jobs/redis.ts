import IORedis from "ioredis";

import { getAppConfig } from "@/server/config/env";

let sharedConnection: IORedis | null = null;

export function isRedisConfigured(env: Record<string, string | undefined> = process.env) {
  return Boolean(getAppConfig(env).REDIS_URL);
}

export function createRedisConnection(env: Record<string, string | undefined> = process.env) {
  const config = getAppConfig(env);
  if (!config.REDIS_URL) {
    throw new Error("REDIS_URL is required before BullMQ queues can be started");
  }

  return new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true
  });
}

export function getRedisConnection(env: Record<string, string | undefined> = process.env) {
  if (!sharedConnection) {
    sharedConnection = createRedisConnection(env);
  }
  return sharedConnection;
}

export async function closeRedisConnection() {
  if (!sharedConnection) return;
  const connection = sharedConnection;
  sharedConnection = null;
  await connection.quit();
}
