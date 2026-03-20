/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * oauth-cards.ts — OAuth 授权卡片构建函数。
 *
 * 从 oauth.ts 提取的纯 UI 函数，与 OAuth 业务流程解耦。
 * 卡片使用 v2 JSON 结构 + i18n_content 支持多语言。
 */
import type { LarkBrand } from '../core/types';
type Locale = 'zh_cn' | 'en_us';
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
    brand?: LarkBrand;
}): Record<string, unknown>;
/** scope 字符串 → 可读描述（支持多语言） */
export declare function formatScopeDescription(locale: Locale, params: {
    scope?: string;
    isBatchAuth?: boolean;
    totalAppScopes?: number;
    alreadyGranted?: number;
    batchInfo?: string;
    filteredScopes?: string[];
    appId?: string;
}): string;
export declare function toInAppWebUrl(targetUrl: string, brand?: LarkBrand): string;
export declare function buildAuthSuccessCard(brand?: LarkBrand): Record<string, unknown>;
export declare function buildAuthFailedCard(_reason: string): Record<string, unknown>;
export declare function buildAuthIdentityMismatchCard(brand?: LarkBrand): Record<string, unknown>;
export {};
