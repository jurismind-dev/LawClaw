/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Agent dispatch for inbound Feishu messages.
 *
 * Builds the agent envelope, prepends chat history context, and
 * dispatches through the appropriate reply path (system command
 * vs. normal streaming/static flow).
 *
 * Implementation details are split across focused modules:
 * - dispatch-context.ts  — DispatchContext type, route/session/event
 * - dispatch-builders.ts — pure payload/body/envelope construction
 * - dispatch-commands.ts — system command & permission notification
 */
import type { RuntimeEnv, HistoryEntry } from 'openclaw/plugin-sdk';
import type { MessageContext } from '../types';
import type { LarkAccount } from '../../core/types';
import type { FeishuGroupConfig } from '../../core/types';
import type { PermissionError } from './permission';
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
export declare function dispatchToAgent(params: {
    ctx: MessageContext;
    permissionError?: PermissionError;
    mediaPayload: Record<string, unknown>;
    quotedContent?: string;
    account: LarkAccount;
    /** account 级别的 ClawdbotConfig（channels.feishu 已替换为 per-account 合并后的配置） */
    accountScopedCfg: ClawdbotConfig;
    runtime?: RuntimeEnv;
    chatHistories?: Map<string, HistoryEntry[]>;
    historyLimit: number;
    /** Override the message ID used for reply threading.  When set, the
     *  reply-dispatcher uses this ID for typing indicators and card replies
     *  instead of ctx.messageId (which may be a synthetic ID). */
    replyToMessageId?: string;
    /** When set, controls whether the sender is authorized to execute
     *  control commands.  Computed by the handler via the SDK's access
     *  group command gating system. */
    commandAuthorized?: boolean;
    /** Per-group configuration for skills, systemPrompt, etc. */
    groupConfig?: FeishuGroupConfig;
    /** Default group configuration from the "*" wildcard entry. */
    defaultGroupConfig?: FeishuGroupConfig;
    /** When true, the reply dispatcher skips typing indicators. */
    skipTyping?: boolean;
}): Promise<void>;
