/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Runtime store for structured tool-use steps.
 *
 * The Feishu card renderer reads from this store by session key so it can
 * render observable, replayable tool execution without relying purely on
 * reply payload text.
 */
export interface ToolUseTraceStep {
    id: string;
    seq: number;
    toolName: string;
    toolCallId?: string;
    runId?: string;
    params?: Record<string, unknown>;
    result?: unknown;
    error?: string;
    durationMs?: number;
    status: 'running' | 'success' | 'error';
    startedAt: number;
    finishedAt?: number;
}
export declare function startToolUseTraceRun(sessionKey: string): void;
export declare function clearToolUseTraceRun(sessionKey: string): void;
export declare function hasToolUseTraceRun(sessionKey?: string): boolean;
export declare function recordToolUseStart(params: {
    sessionKey?: string;
    toolName: string;
    toolParams?: Record<string, unknown>;
    toolCallId?: string;
    runId?: string;
}): void;
export declare function recordToolUseEnd(params: {
    sessionKey?: string;
    toolName: string;
    toolParams?: Record<string, unknown>;
    toolCallId?: string;
    runId?: string;
    result?: unknown;
    error?: string;
    durationMs?: number;
}): void;
export declare function getToolUseTraceSteps(sessionKey?: string): ToolUseTraceStep[];
export declare function sanitizeTraceValue(value: unknown, depth?: number, context?: {
    source?: 'params' | 'result' | 'generic';
    key?: string;
}): unknown;
/** @internal — test-only helper to reset module-level state between test cases. */
export declare function _resetForTesting(): void;
