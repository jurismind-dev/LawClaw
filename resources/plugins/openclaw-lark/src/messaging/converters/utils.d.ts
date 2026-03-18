/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Shared utilities for content converters.
 */
/** Escape a string for safe use inside a RegExp. */
export declare function escapeRegExp(str: string): string;
/**
 * Safely parse a JSON string, returning undefined on failure.
 */
export declare function safeParse(raw: string): unknown | undefined;
/**
 * Format a duration in milliseconds to a human-readable string.
 *
 * Examples: 1500 → "1.5s", 65000 → "65s"
 */
export declare function formatDuration(ms: number): string;
/**
 * Convert a millisecond timestamp to "YYYY-MM-DD HH:mm" in UTC+8 (Beijing time).
 */
export declare function millisToDatetime(ms: string | number): string;
