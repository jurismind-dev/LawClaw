/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Pure construction functions for the agent dispatch pipeline.
 *
 * All functions in this module are side-effect-free: they build data
 * structures (message bodies, envelope payloads, inbound context) but
 * never perform I/O, send messages, or mutate external state.
 */
import type { HistoryEntry } from 'openclaw/plugin-sdk/reply-history';
import type { MessageContext } from '../types';
import type { LarkClient } from '../../core/lark-client';
import type { DispatchContext } from './dispatch-context';
/**
 * Build a `[System: ...]` mention annotation when the message @-mentions
 * non-bot users.  Returns `undefined` when there are no user mentions.
 *
 * Sender identity / chat metadata are handled by the SDK's own
 * `buildInboundUserContextPrefix` (via SenderId, SenderName, ReplyToBody,
 * InboundHistory, etc.), so we only inject the mention data that the SDK
 * does not natively support.
 */
export declare function buildMentionAnnotation(ctx: MessageContext): string | undefined;
/**
 * Pure function: build the annotated message body with optional quote,
 * speaker prefix, and mention annotation (for the envelope Body).
 *
 * Note: message_id and reply_to are now conveyed via system-event tags
 * (msg:om_xxx, reply_to:om_yyy) instead of inline annotations, keeping
 * the body cleaner and avoiding misleading heuristics for non-text
 * message types (merge_forward, interactive cards, etc.).
 */
export declare function buildMessageBody(ctx: MessageContext, quotedContent?: string): string;
/**
 * Build the BodyForAgent value: the clean message content plus an
 * optional mention annotation.
 *
 * SDK >= 2026.2.10 changed the BodyForAgent fallback chain from
 * `BodyForAgent ?? Body` to `BodyForAgent ?? CommandBody ?? RawBody ?? Body`,
 * so annotations embedded only in Body never reach the AI.  Setting
 * BodyForAgent explicitly ensures the mention annotation survives.
 *
 * Sender identity, reply context, and chat history are NOT duplicated
 * here — they are injected by the SDK's `buildInboundUserContextPrefix`
 * via the standard fields (SenderId, SenderName, ReplyToBody,
 * InboundHistory) that we pass in buildInboundPayload.
 *
 * Note: media file paths are substituted into `ctx.content` upstream
 * (handler.ts -> substituteMediaPaths) before this function is called.
 * The SDK's `detectAndLoadPromptImages` will discover image paths from
 * the text and inject them as multimodal content blocks.
 */
export declare function buildBodyForAgent(ctx: MessageContext): string;
/**
 * Unified call to `finalizeInboundContext`, eliminating the duplicated
 * field-mapping between permission notification and main message paths.
 */
export declare function buildInboundPayload(dc: DispatchContext, opts: {
    body: string;
    bodyForAgent: string;
    rawBody: string;
    commandBody: string;
    originatingTo?: string;
    senderName: string;
    senderId: string;
    messageSid: string;
    wasMentioned: boolean;
    replyToBody?: string;
    inboundHistory?: {
        sender: string;
        body: string;
        timestamp: number;
    }[];
    extraFields?: Record<string, unknown>;
}): ReturnType<typeof LarkClient.runtime.channel.reply.finalizeInboundContext>;
/**
 * Format the agent envelope and prepend group chat history if applicable.
 * Returns the combined body and the history key (undefined for DMs).
 */
export declare function buildEnvelopeWithHistory(dc: DispatchContext, messageBody: string, chatHistories: Map<string, HistoryEntry[]> | undefined, historyLimit: number): {
    combinedBody: string;
    historyKey: string | undefined;
};
