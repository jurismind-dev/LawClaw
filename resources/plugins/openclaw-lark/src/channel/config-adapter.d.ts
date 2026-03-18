/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Configuration merge helpers for Feishu account management.
 *
 * Centralises the pattern of merging a partial configuration patch
 * into the Feishu section of the top-level ClawdbotConfig, handling
 * both the default account (top-level fields) and named accounts
 * (nested under `accounts`).
 */
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
/** Set the `enabled` flag on a Feishu account. */
export declare function setAccountEnabled(cfg: ClawdbotConfig, accountId: string, enabled: boolean): ClawdbotConfig;
/** Apply an arbitrary config patch to a Feishu account. */
export declare function applyAccountConfig(cfg: ClawdbotConfig, accountId: string, patch: Record<string, unknown>): ClawdbotConfig;
/** Delete a Feishu account entry from the config. */
export declare function deleteAccount(cfg: ClawdbotConfig, accountId: string): ClawdbotConfig;
/** Collect security warnings for a Feishu account. */
export declare function collectFeishuSecurityWarnings(params: {
    cfg: ClawdbotConfig;
    accountId: string;
}): string[];
