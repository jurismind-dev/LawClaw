/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Inbound message handling pipeline for the Lark/Feishu channel plugin.
 *
 * Orchestrates a seven-stage pipeline:
 *   1. Account resolution
 *   2. Event parsing         → parse.ts (merge_forward expanded in-place)
 *   3. Sender enrichment     → enrich.ts (lightweight, before gate)
 *   4. Policy gate           → gate.ts
 *   5. User name prefetch    → enrich.ts (batch cache warm-up)
 *   6. Content resolution    → enrich.ts (media / quote, parallel)
 *   7. Agent dispatch        → dispatch.ts
 */
import type { ClawdbotConfig, RuntimeEnv } from 'openclaw/plugin-sdk';
import type { HistoryEntry } from 'openclaw/plugin-sdk/reply-history';
import type { FeishuMessageEvent } from '../types';
export declare function handleFeishuMessage(params: {
    cfg: ClawdbotConfig;
    event: FeishuMessageEvent;
    botOpenId?: string;
    runtime?: RuntimeEnv;
    chatHistories?: Map<string, HistoryEntry[]>;
    accountId?: string;
    /** Override the message ID used for reply threading (typing indicators,
     *  card replies, etc.).  Useful for synthetic messages whose message_id
     *  is not a real Feishu message ID. */
    replyToMessageId?: string;
    /** When true, skip the policy gate (mention requirement, allowlist).
     *  Used for synthetic messages that are not real user messages. */
    forceMention?: boolean;
    /** When true, skip the typing indicator for this dispatch (e.g. reactions). */
    skipTyping?: boolean;
}): Promise<void>;
