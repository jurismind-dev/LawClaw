/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Shared helper for dispatching synthetic inbound text messages.
 *
 * Synthetic messages are used to resume the normal inbound pipeline after
 * card actions or OAuth flows complete.
 */
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
export declare function dispatchSyntheticTextMessage(params: {
    cfg: ClawdbotConfig;
    accountId: string;
    chatId: string;
    senderOpenId: string;
    text: string;
    syntheticMessageId: string;
    replyToMessageId: string;
    chatType?: 'p2p' | 'group';
    threadId?: string;
    runtime?: {
        log?: (msg: string) => void;
        error?: (msg: string) => void;
    };
    forceMention?: boolean;
}): Promise<string>;
