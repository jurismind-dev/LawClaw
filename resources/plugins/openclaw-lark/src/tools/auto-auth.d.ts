/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * auto-auth.ts — 工具层自动授权处理。
 *
 * 当 OAPI 工具遇到授权问题时，直接在工具层处理，不再让 AI 判断：
 *
 * - UserAuthRequiredError (appScopeVerified=true)
 *   → 直接调用 executeAuthorize 发起 OAuth Device Flow 卡片
 *
 * - UserScopeInsufficientError
 *   → 直接调用 executeAuthorize（使用 missingScopes）
 *
 * - AppScopeMissingError
 *   → 发送应用权限引导卡片；用户点击"我已完成"后：
 *     1. 更新卡片为处理中状态
 *     2. invalidateAppScopeCache
 *     3. 发送中间合成消息告知 AI（"应用权限已确认，正在发起用户授权..."）
 *     4. 调用 executeAuthorize 发起 OAuth Device Flow
 *
 * - 其他情况（AppScopeCheckFailedError、appScopeVerified=false 等）
 *   → 回退到原 handleInvokeError（不触发自动授权）
 *
 * 降级策略（保守）：以下情况均回退到 handleInvokeError：
 * - 无 LarkTicket（非消息场景）
 * - 无 senderOpenId（无法确定授权对象）
 * - 账号未配置（!acct.configured）
 * - 任何步骤抛出异常
 */
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
/**
 * 处理 card.action.trigger 回调事件（由 monitor.ts 调用）。
 *
 * 当用户点击应用权限引导卡片的"我已完成，继续授权"按钮时：
 * 1. 更新卡片为"处理中"状态
 * 2. 清除应用 scope 缓存
 * 3. 发送中间合成消息告知 AI
 * 4. 发起 OAuth Device Flow
 *
 * 注意：函数体内的主要逻辑通过 setImmediate + fire-and-forget 异步执行，
 * 确保 Feishu card.action.trigger 回调在 3 秒内返回。
 */
export declare function handleCardAction(data: unknown, cfg: ClawdbotConfig, accountId: string): Promise<unknown>;
/**
 * 统一处理 `client.invoke()` 抛出的错误，支持自动发起 OAuth 授权。
 *
 * 替代 `handleInvokeError`，在工具层直接处理授权问题：
 * - 用户授权类错误 → 直接 executeAuthorize（发 Device Flow 卡片）
 * - 应用权限缺失 → 发送引导卡片，用户确认后自动接力 OAuth
 * - 其他错误 → 回退到 handleInvokeError 的标准处理
 *
 * @param err - invoke() 或其他逻辑抛出的错误
 * @param cfg - OpenClaw 配置对象（从工具注册函数的闭包中获取）
 */
export declare function handleInvokeErrorWithAutoAuth(err: unknown, cfg: ClawdbotConfig): Promise<any>;
