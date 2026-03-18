"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Type definitions for the Feishu reply dispatcher subsystem.
 *
 * Consolidates all interfaces, state shapes, and constants used across
 * reply-dispatcher.ts, streaming-card-controller.ts, flush-controller.ts,
 * and unavailable-guard.ts.
 */
// ---------------------------------------------------------------------------
// CardPhase — explicit state machine replacing boolean flags
// ---------------------------------------------------------------------------
export const CARD_PHASES = {
    idle: 'idle',
    creating: 'creating',
    streaming: 'streaming',
    completed: 'completed',
    aborted: 'aborted',
    terminated: 'terminated',
    creation_failed: 'creation_failed',
};
export const TERMINAL_PHASES = new Set([
    'completed',
    'aborted',
    'terminated',
    'creation_failed',
]);
export const PHASE_TRANSITIONS = {
    idle: new Set(['creating', 'aborted', 'terminated']),
    creating: new Set(['streaming', 'creation_failed', 'aborted', 'terminated']),
    streaming: new Set(['completed', 'aborted', 'terminated']),
    completed: new Set(),
    aborted: new Set(),
    terminated: new Set(),
    creation_failed: new Set(),
};
// ---------------------------------------------------------------------------
// Throttle constants
// ---------------------------------------------------------------------------
/**
 * Throttle intervals for card updates.
 *
 * - `CARDKIT_MS`: CardKit `cardElement.content()` — designed for streaming,
 *   low throttle is fine.
 * - `PATCH_MS`: `im.message.patch` — strict rate limits (code 230020).
 * - `LONG_GAP_THRESHOLD_MS`: After a long idle gap (tool call / LLM thinking),
 *   defer the first flush briefly.
 * - `BATCH_AFTER_GAP_MS`: Batching window after a long gap.
 */
export const THROTTLE_CONSTANTS = {
    CARDKIT_MS: 100,
    PATCH_MS: 1500,
    LONG_GAP_THRESHOLD_MS: 2000,
    BATCH_AFTER_GAP_MS: 300,
};
export const EMPTY_REPLY_FALLBACK_TEXT = 'Done.';
