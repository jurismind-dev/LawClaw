/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * App Scope Checker — 查询应用已开通的 scope 列表。
 *
 * 通过 `GET /open-apis/application/v6/applications/:app_id` (TAT) 获取
 * 应用信息，从 `app.scopes` 中提取已开通的 scope 字符串列表。
 *
 * 结果带 30 秒内存缓存，避免每次 invoke() 都调远程 API。
 * scope 检查失败后可调 {@link invalidateAppScopeCache} 清缓存重查。
 */
import type * as Lark from '@larksuiteoapi/node-sdk';
export interface AppInfo {
    appId: string;
    creatorId?: string;
    ownerOpenId?: string;
    ownerType?: number;
    /**
     * 统一的 owner 判定结果。所有需要判定"谁是应用 owner"的场景都应使用此字段。
     *
     * 规则：owner_type=2（企业内成员）时取 owner_id，否则回退 creator_id。
     * 兼容 owner.owner_type 和 owner.type 两种字段名。
     */
    effectiveOwnerOpenId?: string;
    scopes: Array<{
        scope: string;
        token_types?: string[];
    }>;
}
/** 清除指定 appId 的缓存。 */
export declare function invalidateAppScopeCache(appId: string): void;
/**
 * 获取应用已开通的 scope 列表。
 *
 * 需要应用自身有 `application:application:self_manage` 权限。
 * `appId` 可传 `"me"` 查自己。
 *
 * @param sdk - Lark SDK 实例
 * @param appId - 应用 ID
 * @param tokenType - token 类型，用于过滤只支持特定 token 类型的 scope
 * @returns scope 字符串数组，如 `["calendar:calendar", "task:task:write"]`
 */
export declare function getAppGrantedScopes(sdk: Lark.Client, appId: string, tokenType?: 'user' | 'tenant'): Promise<string[]>;
/**
 * 获取应用信息，包括 owner 信息。
 *
 * 复用 getAppGrantedScopes 的 API 调用和缓存。
 * 如果缓存中已有数据且未过期，直接从缓存提取。
 *
 * @param sdk - Lark SDK 实例
 * @param appId - 应用 ID（可传 "me"）
 */
export declare function getAppInfo(sdk: Lark.Client, appId: string): Promise<AppInfo>;
/**
 * 计算 APP 已有 ∩ OAPI 需要 的交集。
 *
 * 用于传给 OAuth 的 scope 参数 — 只请求 APP 已开通且 API 需要的 scope。
 *
 * @param appGranted - 应用已开通的 scope 列表
 * @param apiRequired - OAPI 要求的 scope 列表
 * @returns 交集 scope 列表
 */
export declare function intersectScopes(appGranted: string[], apiRequired: string[]): string[];
/**
 * 计算 OAPI 需要但 APP 未开通的 scope（差集）。
 *
 * 用于 AppScopeMissingError 的 missingScopes。
 *
 * @param appGranted - 应用已开通的 scope 列表
 * @param apiRequired - OAPI 要求的 scope 列表
 * @returns 缺失的 scope 列表
 */
export declare function missingScopes(appGranted: string[], apiRequired: string[]): string[];
/**
 * 校验应用已开通的 scope 是否满足要求。
 *
 * 与 tool-client.ts invoke() 的 scope 校验逻辑完全一致，作为唯一真值来源：
 *   - `scopeNeedType === "all"`: appScopes 必须包含 requiredScopes 的全部项
 *   - 其他（默认 "one"）:        appScopes 与 requiredScopes 的交集非空即可
 *   - appScopes 为空:            视为满足（API 查询失败，退回服务端判断）
 *
 * @param appScopes      - 应用已开通的 scope 列表（由 getAppGrantedScopes 返回）
 * @param requiredScopes - 需要的 scope 列表
 * @param scopeNeedType  - "all" 表示全部必须，undefined/"one" 表示任一即可
 */
export declare function isAppScopeSatisfied(appScopes: string[], requiredScopes: string[], scopeNeedType?: 'one' | 'all'): boolean;
