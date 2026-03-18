/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Message forwarding for the Lark/Feishu channel plugin.
 *
 * Provides a function to forward an existing message to another chat
 * or user using the IM Message Forward API.
 */
import type { OpenClawConfig } from 'openclaw/plugin-sdk';
import type { FeishuSendResult } from '../types';
/**
 * Forward an existing message to another chat or user.
 *
 * @param params.cfg       - Plugin configuration with Feishu credentials.
 * @param params.messageId - The message ID to forward.
 * @param params.to        - Target identifier (chat_id, open_id, or user_id).
 * @param params.accountId - Optional account identifier for multi-account setups.
 * @returns The send result containing the new forwarded message ID.
 */
export declare function forwardMessageFeishu(params: {
    cfg: OpenClawConfig;
    messageId: string;
    to: string;
    accountId?: string;
}): Promise<FeishuSendResult>;
