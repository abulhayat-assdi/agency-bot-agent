import { logger } from "@/server/observability/logger";

/**
 * Adaptive pacing for Meta sync work.
 *
 * Meta's synchronous Graph API does not publish a numeric quota we can read
 * ahead of time, so this controller uses AIMD on observed outcomes:
 * rate_limit/transient/network pressure increases the delay, sustained
 * health decays it back toward zero. An explicit Retry-After signal (when
 * Meta sends one) jumps straight to that delay. All bounds are conservative.
 */

export type ThrottleOptions = {
  baseDelayMs?: number;
  maxDelayMs?: number;
};

export type ThrottleSnapshot = {
  accountId: string;
  currentDelayMs: number;
  consecutivePressure: number;
  consecutiveHealthy: number;
  updatedAt: string;
};

const DEFAULT_BASE_MS = 500;
const DEFAULT_MAX_MS = 30_000;

type AccountState = {
  delayMs: number;
  pressure: number;
  healthy: number;
};

export class SyncThrottleController {
  private readonly states = new Map<string, AccountState>();
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(options: ThrottleOptions = {}) {
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_MS;
    this.maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_MS;
  }

  private stateFor(accountId: string): AccountState {
    const existing = this.states.get(accountId);
    if (existing) return existing;
    const created: AccountState = { delayMs: 0, pressure: 0, healthy: 0 };
    this.states.set(accountId, created);
    return created;
  }

  /** Sleep the currently advised delay before issuing more Meta work. */
  async pace(accountId: string) {
    const state = this.stateFor(accountId);
    if (state.delayMs <= 0) return;
    logger.info("Pacing Meta sync work under rate pressure", { accountId, delayMs: state.delayMs });
    await new Promise((resolve) => setTimeout(resolve, state.delayMs));
  }

  /** Call after each unit of Meta work with the observed outcome. */
  recordOutcome(accountId: string, outcome: "healthy" | "pressure", retryAfterMs?: number) {
    const state = this.stateFor(accountId);
    if (outcome === "pressure") {
      state.pressure += 1;
      state.healthy = 0;
      if (retryAfterMs !== undefined && Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
        state.delayMs = Math.min(Math.round(retryAfterMs), this.maxDelayMs);
      } else {
        state.delayMs = Math.min(state.delayMs === 0 ? this.baseDelayMs : state.delayMs * 2, this.maxDelayMs);
      }
      logger.warn("Meta rate pressure observed; increasing sync delay", {
        accountId,
        delayMs: state.delayMs,
        consecutivePressure: state.pressure
      });
    } else {
      state.healthy += 1;
      state.pressure = 0;
      // Additive decrease: recover gradually after sustained health.
      if (state.healthy >= 3) {
        state.delayMs = Math.max(0, Math.floor(state.delayMs / 2));
        state.healthy = 0;
      }
    }
  }

  snapshot(accountId: string): ThrottleSnapshot {
    const state = this.stateFor(accountId);
    return {
      accountId,
      currentDelayMs: state.delayMs,
      consecutivePressure: state.pressure,
      consecutiveHealthy: state.healthy,
      updatedAt: new Date().toISOString()
    };
  }

  reset(accountId?: string) {
    if (accountId) this.states.delete(accountId);
    else this.states.clear();
  }
}

export const globalSyncThrottle = new SyncThrottleController();
