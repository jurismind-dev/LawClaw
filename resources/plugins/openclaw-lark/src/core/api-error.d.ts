/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Shared Lark API error handling utilities.
 *
 * Provides unified error handling for two distinct error paths:
 *
 * 1. **Response-level errors** — The SDK returns a response object with a
 *    non-zero `code`.  Handled by {@link assertLarkOk}.
 *
 * 2. **Thrown exceptions** — The SDK throws an Axios-style error (HTTP 4xx)
 *    whose properties include the Feishu error `code` and `msg`.
 *    Handled by {@link formatLarkError}.
 *
 * Both paths intercept well-known codes (e.g. LARK_ERROR.APP_SCOPE_MISSING (99991672) — missing API scopes)
 * and produce user-friendly messages with actionable authorization links.
 */
/**
 * 从 Lark SDK 抛错对象中提取飞书 API code。
 *
 * 支持三种常见结构：
 * - `{ code }` — SDK 直接挂载
 * - `{ data: { code } }` — 响应体嵌套
 * - `{ response: { data: { code } } }` — Axios 风格
 */
export declare function extractLarkApiCode(err: unknown): number | undefined;
/**
 * Assert that a Lark SDK response is successful (code === 0).
 *
 * For permission errors (code LARK_ERROR.APP_SCOPE_MISSING (99991672)), the thrown error includes the
 * required scope names and a direct authorization URL so the AI can
 * present it to the end user.
 */
export declare function assertLarkOk(res: {
    code?: number;
    msg?: string;
}): void;
/**
 * Extract a meaningful error message from a thrown Lark SDK / Axios error.
 *
 * The Lark SDK throws Axios errors whose object carries Feishu-specific
 * fields (`code`, `msg`) alongside the standard `message`.  For permission
 * errors (LARK_ERROR.APP_SCOPE_MISSING (99991672)) we format a user-friendly string with scopes + auth URL.
 * For all other errors we try `err.msg` first (the Feishu detail) and fall
 * back to `err.message` (the generic Axios text).
 */
export declare function formatLarkError(err: unknown): string;
