/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Generic throttled flush controller.
 *
 * A pure scheduling primitive that manages timer-based throttling,
 * mutex-guarded flushing, and reflush-on-conflict. Contains no
 * business logic — the actual flush work is provided via a callback.
 */
export declare class FlushController {
    private readonly doFlush;
    private flushInProgress;
    private flushResolvers;
    private needsReflush;
    private pendingFlushTimer;
    private lastUpdateTime;
    private isCompleted;
    constructor(doFlush: () => Promise<void>);
    /** Mark the controller as completed — no more flushes after current one. */
    complete(): void;
    /** Cancel any pending deferred flush timer. */
    cancelPendingFlush(): void;
    /** Wait for any in-progress flush to finish. */
    waitForFlush(): Promise<void>;
    /**
     * Execute a flush (mutex-guarded, with reflush on conflict).
     *
     * If a flush is already in progress, marks needsReflush so a
     * follow-up flush fires immediately after the current one completes.
     */
    flush(): Promise<void>;
    /**
     * Throttled update entry point.
     *
     * @param throttleMs - Minimum interval between flushes (varies by
     *   CardKit vs IM patch mode). Passed in by the caller so this
     *   controller remains business-logic-free.
     */
    throttledUpdate(throttleMs: number): Promise<void>;
    /** Overridable gate: subclasses / consumers can set via setCardMessageReady. */
    private _cardMessageReady;
    cardMessageReady(): boolean;
    setCardMessageReady(ready: boolean): void;
}
