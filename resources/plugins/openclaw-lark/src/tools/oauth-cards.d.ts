/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * oauth-cards.ts — OAuth 授权卡片构建函数。
 *
 * 从 oauth.ts 提取的纯 UI 函数，与 OAuth 业务流程解耦。
 */
export declare function buildAuthCard(params: {
    verificationUriComplete: string;
    expiresMin: number;
    scope?: string;
    isBatchAuth?: boolean;
    totalAppScopes?: number;
    alreadyGranted?: number;
    batchInfo?: string;
    filteredScopes?: string[];
    appId?: string;
    showBatchAuthHint?: boolean;
}): Record<string, unknown>;
/** scope 字符串 → 可读描述 */
export declare function formatScopeDescription(scope?: string, isBatchAuth?: boolean, totalAppScopes?: number, alreadyGranted?: number, batchInfo?: string, _filteredScopes?: string[], _appId?: string): string;
export declare function toInAppWebUrl(targetUrl: string): string;
export declare function buildAuthSuccessCard(): Record<string, unknown>;
export declare function buildAuthFailedCard(_reason: string): Record<string, unknown>;
export declare function buildAuthIdentityMismatchCard(): Record<string, unknown>;
