type Closer = () => void | Promise<void>;

export type ShutdownCoordinatorOptions = {
  timeoutMs?: number;
  exit?: (code: number) => void;
  onTimeout?: (pending: string[]) => void;
};

/**
 * Ordered graceful shutdown shared by web/worker/scheduler entrypoints.
 * Registers named async closers (BullMQ, DB, Redis), handles SIGINT/SIGTERM
 * exactly once, and force-exits if closers hang past the timeout.
 */
export function createShutdownCoordinator(options: ShutdownCoordinatorOptions = {}) {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const closers = new Map<string, Closer>();
  let shuttingDown = false;

  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    const pending = [...closers.keys()];
    const timer = setTimeout(() => {
      options.onTimeout?.(pending);
      exit(1);
    }, timeoutMs);
    // Don't keep the process alive just for the force-exit timer.
    (timer as { unref?: () => void }).unref?.();

    for (const [name, close] of closers) {
      try {
        await close();
      } catch {
        // One failing closer must not block the rest.
      }
      const index = pending.indexOf(name);
      if (index >= 0) pending.splice(index, 1);
    }
    clearTimeout(timer);
    void signal;
    exit(0);
  }

  return {
    register(name: string, close: Closer) {
      closers.set(name, close);
    },
    shutdown,
    isShuttingDown() {
      return shuttingDown;
    },
    install() {
      process.on("SIGINT", () => void shutdown("SIGINT"));
      process.on("SIGTERM", () => void shutdown("SIGTERM"));
    }
  };
}
