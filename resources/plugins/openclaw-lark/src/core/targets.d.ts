/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Feishu target ID parsing and formatting utilities.
 *
 * Feishu uses several namespaced identifier prefixes:
 *   - `oc_*`  -- chat (group / DM) IDs
 *   - `ou_*`  -- open user IDs
 *   - plain alphanumeric strings -- user IDs from the tenant directory
 *
 * This module provides helpers to detect, normalise, and format these IDs
 * for both internal routing and outbound Feishu API calls.
 */
import type { FeishuIdType } from './types';
/**
 * Detect the Feishu ID type from a raw identifier string.
 *
 * Returns `null` when the string does not match any known pattern.
 */
export declare function detectIdType(id: string): FeishuIdType | null;
/**
 * Strip OpenClaw routing prefixes (`chat:`, `user:`, `open_id:`) from a
 * raw target string, returning the bare Feishu identifier.
 *
 * Returns `null` when the input is empty or falsy.
 */
export declare function normalizeFeishuTarget(raw: string): string | null;
/**
 * Add the appropriate OpenClaw routing prefix to a bare Feishu identifier.
 *
 * When `type` is omitted, the prefix is inferred via `detectIdType`.
 */
export declare function formatFeishuTarget(id: string, type?: FeishuIdType): string;
/**
 * Determine the `receive_id_type` query parameter for the Feishu send-message
 * API based on the target identifier.
 */
export declare function resolveReceiveIdType(id: string): 'chat_id' | 'open_id' | 'user_id';
/**
 * 规范化 message_id，去除合成后缀（如 `om_xxx:auth-complete` → `om_xxx`）。
 */
export declare function normalizeMessageId(messageId: string): string;
export declare function normalizeMessageId(messageId: string | undefined): string | undefined;
/**
 * Return `true` when a raw string looks like it could be a Feishu target
 * (either an OpenClaw-tagged form or a native prefix).
 */
export declare function looksLikeFeishuId(raw: string): boolean;
