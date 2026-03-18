/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Permission error extraction and cooldown tracking for Feishu API calls.
 *
 * Extracted from bot.ts: PermissionError type, extractPermissionError,
 * PERMISSION_ERROR_COOLDOWN_MS, permissionErrorNotifiedAt.
 */
export interface PermissionError {
    code: number;
    message: string;
    grantUrl?: string;
}
export declare function extractPermissionError(err: unknown): PermissionError | null;
export declare const PERMISSION_ERROR_COOLDOWN_MS: number;
export declare const permissionErrorNotifiedAt: Map<string, number>;
