type Attempt = {
  count: number;
  resetAt: number;
};

const attempts = new Map<string, Attempt>();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function checkLoginRateLimit(key: string, now = Date.now()) {
  const existing = attempts.get(key);

  if (!existing || existing.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, resetAt: now + WINDOW_MS };
  }

  if (existing.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  attempts.set(key, existing);
  return { allowed: true, remaining: MAX_ATTEMPTS - existing.count, resetAt: existing.resetAt };
}

export function resetLoginRateLimit(key: string) {
  attempts.delete(key);
}
