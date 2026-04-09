/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * AskUserQuestion tool — AI agent 主动向用户提问并等待回答。
 *
 * 流程（非阻塞，遵循 auto-auth synthetic message 模式）：
 * 1. AI 调用 AskUserQuestion 工具，传入问题和选项
 * 2. 发送 form 交互式飞书卡片
 * 3. 工具 execute() 立即返回 { status: 'pending' }
 * 4. 用户填写表单并点击提交，form_value 一次性回传
 * 5. handleAskUserAction 解析答案，注入 synthetic message
 * 6. AI 在新一轮对话中收到用户答案
 *
 * 所有卡片统一使用 form 容器，交互组件在本地缓存值，
 * 提交时通过 form_value 一次性回调，避免独立回调导致的 loading 闪烁。
 */
import type { ClawdbotConfig, OpenClawPluginApi } from 'openclaw/plugin-sdk';
/**
 * 处理 form 表单提交事件。
 *
 * 统一使用 form 后，所有值通过 form_value 一次性提交。
 * 解析答案后注入 synthetic message，AI 在新一轮对话中收到答案。
 *
 * @returns 卡片回调响应，或 undefined 表示非本模块的 action
 */
export declare function handleAskUserAction(data: unknown, _cfg: ClawdbotConfig, accountId: string): unknown | undefined;
export declare function registerAskUserQuestionTool(api: OpenClawPluginApi): void;
