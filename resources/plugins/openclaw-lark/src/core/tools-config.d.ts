/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Default values and resolution logic for the Feishu tools configuration.
 *
 * Each boolean flag controls whether a particular category of Feishu-specific
 * agent tools (document access, wiki queries, drive operations, etc.) is
 * enabled for a given account.
 */
import type { FeishuToolsConfig, LarkAccount } from './types';
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
/**
 * The default tools configuration.
 *
 * By default every non-destructive capability is enabled.  The `perm` flag
 * (permission management) defaults to `false` because granting / revoking
 * permissions is a privileged operation that admins should opt into
 * explicitly.
 */
export declare const DEFAULT_TOOLS_CONFIG: Required<FeishuToolsConfig>;
/**
 * Merge a partial tools configuration with `DEFAULT_TOOLS_CONFIG`.
 *
 * Fields present in the input take precedence; anything absent falls back
 * to the default value.
 */
export declare function resolveToolsConfig(cfg?: FeishuToolsConfig): Required<FeishuToolsConfig>;
/**
 * 合并多个账户的工具配置（取并集）。
 *
 * 工具注册是全局的（启动时注册一次），只要任意一个账户启用了某工具，
 * 该工具就应被注册。执行时由 LarkTicket 路由到具体账户。
 */
export declare function resolveAnyEnabledToolsConfig(accounts: LarkAccount[]): Required<FeishuToolsConfig>;
/**
 * 检查工具是否应该被注册（channel 级别的 tools.deny 检查）。
 *
 * 从 `channels.feishu.tools.deny` 读取禁用列表，支持通配符模式。
 *
 * @param cfg - OpenClaw 配置对象
 * @param toolName - 工具名称（如 `feishu_im_user_message`）
 * @returns `true` 如果应该注册，`false` 如果应该跳过
 *
 * @example
 * ```typescript
 * // 配置示例：
 * // channels.feishu.tools.deny: ["feishu_im_user_message", "feishu_calendar_*"]
 *
 * shouldRegisterTool(cfg, "feishu_im_user_message")  // false
 * shouldRegisterTool(cfg, "feishu_calendar_event")   // false (匹配通配符)
 * shouldRegisterTool(cfg, "feishu_task_task")        // true
 * ```
 */
export declare function shouldRegisterTool(cfg: ClawdbotConfig, toolName: string): boolean;
