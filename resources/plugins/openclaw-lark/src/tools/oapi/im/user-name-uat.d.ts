/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * UAT 用户名解析模块
 *
 * 独立于 messaging/inbound 层的 TAT UserNameCache，
 * 用于工具层以用户身份（UAT）批量解析用户显示名。
 *
 * 设计动机：TAT 调用 contact/v3/users/batch 缺少权限导致返回的用户
 * 条目不含 name 字段，而工具层搜索消息等场景运行在 UAT 上下文中，
 * 用户 token 可以读取其他用户的名称。
 */
import type { ToolClient } from '../../../core/tool-client';
/** 从 UAT 缓存中获取用户名 */
export declare function getUATUserName(accountId: string, openId: string): string | undefined;
/** 批量写入 UAT 缓存 */
export declare function setUATUserNames(accountId: string, entries: Map<string, string>): void;
export declare function batchResolveUserNamesAsUser(params: {
    client: ToolClient;
    openIds: string[];
    log: (...args: unknown[]) => void;
}): Promise<Map<string, string>>;
