/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_oauth_batch_auth tool — 批量授权应用已开通的所有用户权限。
 *
 * 自动识别应用已开通但用户未授权的 scope，一次性发起授权请求。
 * 复用 oauth.ts 的 executeAuthorize() 函数。
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuOAuthBatchAuthTool(api: OpenClawPluginApi): void;
