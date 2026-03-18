/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Type definitions for the Feishu reply dispatcher subsystem.
 *
 * Consolidates all interfaces, state shapes, and constants used across
 * reply-dispatcher.ts, streaming-card-controller.ts, flush-controller.ts,
 * and unavailable-guard.ts.
 */
import type { ClawdbotConfig, ReplyPayload } from 'openclaw/plugin-sdk';
import type { FeishuFooterConfig } from '../core/types';
export declare const CARD_PHASES: {
    readonly idle: "idle";
    readonly creating: "creating";
    readonly streaming: "streaming";
    readonly completed: "completed";
    readonly aborted: "aborted";
    readonly terminated: "terminated";
    readonly creation_failed: "creation_failed";
};
export type CardPhase = (typeof CARD_PHASES)[keyof typeof CARD_PHASES];
export declare const TERMINAL_PHASES: ReadonlySet<CardPhase>;
/**
 * Why a terminal phase was entered.
 *
 * - `normal`          — streaming completed successfully (onIdle).
 * - `error`           — an error occurred during reply generation (onError).
 * - `abort`           — explicitly cancelled by the caller (abortCard).
 * - `unavailable`     — source message was deleted/recalled (UnavailableGuard).
 * - `creation_failed` — card creation failed, falling back to static delivery.
 */
export type TerminalReason = 'normal' | 'error' | 'abort' | 'unavailable' | 'creation_failed';
export declare const PHASE_TRANSITIONS: Record<CardPhase, ReadonlySet<CardPhase>>;
export interface ReasoningState {
    accumulatedReasoningText: string;
    reasoningStartTime: number | null;
    reasoningElapsedMs: number;
    isReasoningPhase: boolean;
}
export interface StreamingTextState {
    accumulatedText: string;
    completedText: string;
    streamingPrefix: string;
    lastPartialText: string;
}
export interface CardKitState {
    cardKitCardId: string | null;
    originalCardKitCardId: string | null;
    cardKitSequence: number;
    cardMessageId: string | null;
}
/**
 * Throttle intervals for card updates.
 *
 * - `CARDKIT_MS`: CardKit `cardElement.content()` — designed for streaming,
 *   low throttle is fine.
 * - `PATCH_MS`: `im.message.patch` — strict rate limits (code 230020).
 * - `LONG_GAP_THRESHOLD_MS`: After a long idle gap (tool call / LLM thinking),
 *   defer the first flush briefly.
 * - `BATCH_AFTER_GAP_MS`: Batching window after a long gap.
 */
export declare const THROTTLE_CONSTANTS: {
    readonly CARDKIT_MS: 100;
    readonly PATCH_MS: 1500;
    readonly LONG_GAP_THRESHOLD_MS: 2000;
    readonly BATCH_AFTER_GAP_MS: 300;
};
export declare const EMPTY_REPLY_FALLBACK_TEXT = "Done.";
export interface CreateFeishuReplyDispatcherParams {
    cfg: ClawdbotConfig;
    agentId: string;
    chatId: string;
    replyToMessageId?: string;
    /** Account ID for multi-account support. */
    accountId?: string;
    /** Chat type for scene-aware reply mode selection. */
    chatType?: 'p2p' | 'group';
    /** When true, typing indicators are suppressed entirely. */
    skipTyping?: boolean;
    /** When true, replies are sent into the thread instead of main chat. */
    replyInThread?: boolean;
}
/**
 * Manual mirror of the SDK-internal ReplyDispatcher type
 * (from openclaw/plugin-sdk auto-reply/reply/reply-dispatcher.d.ts).
 *
 * Must be kept in sync when the SDK updates the dispatcher signature.
 */
export interface ReplyDispatcher {
    sendToolResult: (payload: ReplyPayload) => boolean;
    sendBlockReply: (payload: ReplyPayload) => boolean;
    sendFinalReply: (payload: ReplyPayload) => boolean;
    waitForIdle: () => Promise<void>;
    getQueuedCounts: () => Record<string, number>;
    markComplete: () => void;
}
/**
 * The structured return type of createFeishuReplyDispatcher.
 *
 * `replyOptions` is typed as `Record<string, unknown>` because the consumer
 * (`dispatchReplyFromConfig`) accepts the SDK-internal `GetReplyOptions`
 * which is not re-exported from `openclaw/plugin-sdk`. The record type
 * is compatible with spread-assignment into `dispatchReplyFromConfig`.
 */
export interface FeishuReplyDispatcherResult {
    dispatcher: ReplyDispatcher;
    replyOptions: Record<string, unknown>;
    markDispatchIdle: () => void;
    markFullyComplete: () => void;
    abortCard: () => Promise<void>;
}
export interface StreamingCardDeps {
    cfg: ClawdbotConfig;
    accountId: string | undefined;
    chatId: string;
    replyToMessageId: string | undefined;
    replyInThread: boolean | undefined;
    resolvedFooter: Required<FeishuFooterConfig>;
}
