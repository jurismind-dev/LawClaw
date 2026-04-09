/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Shared utilities for the reasoning display subsystem.
 */
export declare function normalizeToolName(name?: string): string;
export declare function truncateText(value: string, maxLength: number): string;
export declare function redactInlineSecrets(value: string): string;
/**
 * Sanitize tool params for safe logging.
 * Logs only param key names (no values) to avoid leaking sensitive data.
 */
export declare function sanitizeParamsForLog(params?: Record<string, unknown>): string;
