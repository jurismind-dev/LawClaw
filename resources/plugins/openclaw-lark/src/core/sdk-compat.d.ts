/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Local shim for readReactionParams whose SDK signature changed in
 * 2026.3.14 (now requires a channel-specific config object).
 * Re-exports jsonResult from the SDK directly.
 */
export { jsonResult } from 'openclaw/plugin-sdk/agent-runtime';
/**
 * Extract reaction parameters from raw action params.
 * Returns emoji, remove flag, and isEmpty indicator.
 */
export declare function readReactionParams(params: Record<string, unknown>, opts?: {
    removeErrorMessage?: string;
}): {
    emoji: string;
    remove: boolean;
    isEmpty: boolean;
};
