/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * owner-policy.ts — 应用 Owner 访问控制策略。
 *
 * 从 uat-client.ts 迁移 owner 检查逻辑到独立 policy 层。
 * 提供 fail-close 策略（安全优先：授权发起路径）。
 */
import type { ConfiguredLarkAccount } from './types';
/**
 * 非应用 owner 尝试执行 owner-only 操作时抛出。
 *
 * 注意：`appOwnerId` 仅用于内部日志，不应序列化到用户可见的响应中，
 * 以避免泄露 owner 的 open_id。
 */
export declare class OwnerAccessDeniedError extends Error {
    readonly userOpenId: string;
    readonly appOwnerId: string;
    constructor(userOpenId: string, appOwnerId: string);
}
/**
 * 校验用户是否为应用 owner（fail-close 版本）。
 *
 * - 获取 owner 失败时 → 拒绝（安全优先）
 * - owner 不匹配时 → 拒绝
 *
 * 适用于：`executeAuthorize`（OAuth 授权发起）、`commands/auth.ts`（批量授权）等
 * 赋予实质性权限的入口。
 */
export declare function assertOwnerAccessStrict(account: ConfiguredLarkAccount, sdk: any, userOpenId: string): Promise<void>;
