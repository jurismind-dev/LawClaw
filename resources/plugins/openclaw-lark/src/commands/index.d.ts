/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Register all chat commands (/feishu_diagnose, /feishu_doctor, /feishu_auth, /feishu).
 */
import type { OpenClawPluginApi, OpenClawConfig } from 'openclaw/plugin-sdk';
import type { FeishuLocale } from './locale';
/**
 * 运行 /feishu start 校验，返回 Markdown 格式结果。
 */
export declare function runFeishuStart(config: OpenClawConfig, locale?: FeishuLocale): string;
/**
 * 运行 /feishu start，同时生成中英双语结果。
 */
export declare function runFeishuStartI18n(config: OpenClawConfig): Record<FeishuLocale, string>;
/**
 * 生成 /feishu help 帮助文本。
 */
export declare function getFeishuHelp(locale?: FeishuLocale): string;
/**
 * 生成 /feishu help，同时生成中英双语结果。
 */
export declare function getFeishuHelpI18n(): Record<FeishuLocale, string>;
export declare function registerCommands(api: OpenClawPluginApi): void;
