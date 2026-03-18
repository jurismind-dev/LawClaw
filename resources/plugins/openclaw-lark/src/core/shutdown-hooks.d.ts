/** @internal — test-only reset. */
export declare function _resetShutdownHooks(): void;
/**
 * Register a cleanup callback to run during graceful shutdown.
 *
 * @param key - Unique identifier for this hook (duplicate keys overwrite).
 * @param cleanup - Async function to execute on shutdown.
 * @returns An unregister function — call it when the resource is
 *          released normally (e.g. card streaming completes).
 */
export declare function registerShutdownHook(key: string, cleanup: () => Promise<void>): () => void;
/**
 * Drain all registered shutdown hooks (best-effort, bounded by deadline).
 *
 * @param opts - Optional configuration.
 * @param opts.deadlineMs - Maximum time to wait for all hooks (default 5000).
 * @param opts.log - Logger function for progress/error output.
 */
export declare function drainShutdownHooks(opts?: {
    deadlineMs?: number;
    log?: (...args: unknown[]) => void;
}): Promise<void>;
