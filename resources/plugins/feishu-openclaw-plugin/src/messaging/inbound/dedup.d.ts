/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * FIFO-based message deduplication.
 *
 * Feishu WebSocket connections may redeliver messages on reconnect.
 * This module tracks recently-seen message IDs and filters duplicates.
 *
 * Design choices:
 * - FIFO eviction (not LRU) — message IDs are write-once/check-once,
 *   no hot/cold access pattern.  FIFO naturally expires the oldest entry
 *   first, which matches the dedup semantics.
 * - ES2015 `Map` preserves insertion order, giving us FIFO for free.
 * - Periodic sweep leverages FIFO ordering: iterate from oldest and
 *   `break` at the first non-expired entry → O(expired), not O(n).
 */
export interface MessageDedupOpts {
    /** Time-to-live for each entry in milliseconds (default: 5 min). */
    ttlMs?: number;
    /** Maximum number of tracked entries (default: 10 000). */
    maxEntries?: number;
}
/**
 * Check whether a message is too old to process.
 *
 * Feishu message `create_time` is a millisecond Unix timestamp encoded
 * as a string.  When a WebSocket reconnects after a long outage, stale
 * messages may be redelivered — this function lets callers discard them
 * before entering the full handling pipeline.
 */
export declare function isMessageExpired(createTimeStr: string | undefined, expiryMs?: number): boolean;
export declare class MessageDedup {
    private readonly store;
    private readonly ttlMs;
    private readonly maxEntries;
    private readonly sweepTimer;
    constructor(opts?: MessageDedupOpts);
    /**
     * Try to record a message ID.
     *
     * @param id   Unique message identifier (e.g. Feishu `message_id`).
     * @param scope Optional scope prefix (e.g. accountId) to namespace IDs.
     * @returns `true` if the message is **new**; `false` if it is a duplicate.
     */
    tryRecord(id: string, scope?: string): boolean;
    /** Current number of tracked entries (for diagnostics). */
    get size(): number;
    /** Remove all entries and stop the periodic sweep. */
    clear(): void;
    /** Stop the periodic sweep timer and clear all tracked entries. */
    dispose(): void;
    /**
     * Sweep expired entries from the front of the map.
     * Because entries are in insertion order (FIFO), we can stop as soon as
     * we hit one that hasn't expired yet.
     */
    private sweep;
}
//# sourceMappingURL=dedup.d.ts.map