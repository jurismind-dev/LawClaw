/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Drive comment event handler for the Lark/Feishu channel plugin.
 *
 * Handles `drive.notice.comment_add_v1` events by resolving comment
 * context, enforcing access policies, building a synthetic
 * {@link MessageContext}, and dispatching to the agent.
 *
 * Modeled after the reaction handler pattern (reaction-handler.ts):
 * bypasses the 7-stage message pipeline and dispatches directly.
 */
import type { ClawdbotConfig, RuntimeEnv } from 'openclaw/plugin-sdk';
import type { HistoryEntry } from 'openclaw/plugin-sdk/reply-history';
import type { FeishuDriveCommentEvent } from '../types';
/**
 * Handle a Drive comment event.
 *
 * Resolves the comment context, checks access policies, builds a
 * synthetic MessageContext, and dispatches to the agent.
 */
export declare function handleFeishuCommentEvent(params: {
    cfg: ClawdbotConfig;
    event: FeishuDriveCommentEvent;
    botOpenId?: string;
    runtime?: RuntimeEnv;
    chatHistories?: Map<string, HistoryEntry[]>;
    accountId?: string;
}): Promise<void>;
