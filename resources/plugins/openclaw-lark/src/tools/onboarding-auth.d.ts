/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Onboarding 预授权模块。
 *
 * 配对后自动发起 OAuth Device Flow，引导应用 owner 完成用户授权。
 * 仅当配对用户 === 应用 owner 时触发。
 *
 * 飞书限制：单次 OAuth 最多 50 个 scope。
 * 超过 50 个时自动分批处理，每批授权完成后自动发起下一批（链式触发）。
 */
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
/**
 * 配对后触发 onboarding OAuth 授权。
 *
 * 流程：
 *   1. 检查 userOpenId === 应用 owner，不匹配则静默跳过
 *   2. 读取 onboarding-scopes.json 中的 user scope 列表
 *   3. 分批处理（每批最多 50 个），第一批直接发起 OAuth Device Flow
 *   4. 每批授权完成后通过 onAuthComplete 回调自动发起下一批
 */
export declare function triggerOnboarding(params: {
    cfg: ClawdbotConfig;
    userOpenId: string;
    accountId: string;
}): Promise<void>;
