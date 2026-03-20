/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_auth command — 飞书用户权限批量授权命令实现
 *
 * 直接复用 onboarding-auth.ts 的 triggerOnboarding() 函数。
 * 注意：此命令仅限应用 owner 执行（与 onboarding 逻辑一致）
 */
import type { OpenClawConfig } from 'openclaw/plugin-sdk';
import type { FeishuLocale } from './locale';
/**
 * 执行飞书用户权限批量授权命令
 * 直接调用 triggerOnboarding()，包含 owner 检查
 */
export declare function runFeishuAuth(config: OpenClawConfig, locale?: FeishuLocale): Promise<string>;
/**
 * 运行飞书授权命令，同时生成中英双语结果。
 * 副作用（triggerOnboarding）只执行一次，结果格式化为双语文本。
 */
export declare function runFeishuAuthI18n(config: OpenClawConfig): Promise<Record<FeishuLocale, string>>;
