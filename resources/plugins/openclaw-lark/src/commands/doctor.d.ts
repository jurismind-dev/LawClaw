/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu-doctor 诊断报告 Markdown 格式化（完全重构版）
 *
 * 直接生成 Markdown 诊断报告，不依赖 diagnose.ts 的任何架构和代码。
 * 按照 doctor_template.md 的格式规范实现。
 */
import type { OpenClawConfig } from 'openclaw/plugin-sdk';
export type { FeishuLocale } from './locale';
import type { FeishuLocale } from './locale';
/** @deprecated Use FeishuLocale instead */
export type DoctorLocale = FeishuLocale;
/**
 * 运行飞书插件诊断，生成 Markdown 格式报告。
 *
 * @param config - OpenClaw 配置
 * @param currentAccountId - 当前发送命令的机器人账号 ID（若有则只诊断该账号）
 * @param locale - 输出语言，默认 zh_cn
 */
export declare function runFeishuDoctor(config: OpenClawConfig, currentAccountId?: string, locale?: DoctorLocale): Promise<string>;
/**
 * 运行飞书插件诊断，同时生成中英双语 Markdown 报告。
 * 用于飞书 channel 的多语言 post 发送。
 */
export declare function runFeishuDoctorI18n(config: OpenClawConfig, currentAccountId?: string): Promise<Record<DoctorLocale, string>>;
