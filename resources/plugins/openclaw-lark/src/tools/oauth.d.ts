/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_oauth tool — User OAuth authorisation management.
 *
 * Actions:
 *   - authorize : Initiate Device Flow, send auth card, poll for token.
 *   - status    : Check whether the current user has a valid UAT.
 *   - revoke    : Remove the current user's stored UAT.
 *
 * Security:
 *   - **Does not** accept a `user_open_id` parameter.  The target user is
 *     always the message sender, obtained from the LarkTicket.
 *   - Token values are never included in the return payload (AI cannot see
 *     them).
 */
import type { ClawdbotConfig, OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { ConfiguredLarkAccount } from '../core/types';
import type { LarkTicket } from '../core/lark-ticket';
export declare function registerFeishuOAuthTool(api: OpenClawPluginApi): void;
export interface ExecuteAuthorizeParams {
    account: ConfiguredLarkAccount;
    senderOpenId: string;
    scope: string;
    isBatchAuth?: boolean;
    totalAppScopes?: number;
    alreadyGranted?: number;
    batchInfo?: string;
    skipSyntheticMessage?: boolean;
    showBatchAuthHint?: boolean;
    forceAuth?: boolean;
    onAuthComplete?: () => void | Promise<void>;
    cfg: ClawdbotConfig;
    ticket: LarkTicket | undefined;
}
/**
 * 执行 OAuth 授权流程（Device Flow）
 * 可被 feishu_oauth 和 feishu_oauth_batch_auth 共享调用
 */
export declare function executeAuthorize(params: ExecuteAuthorizeParams): Promise<{
    content: Array<{
        type: 'text';
        text: string;
    }>;
    details: unknown;
}>;
