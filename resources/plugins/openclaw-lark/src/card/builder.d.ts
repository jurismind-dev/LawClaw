/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Interactive card building for Lark/Feishu.
 *
 * Provides utilities to construct Feishu Interactive Message Cards for
 * different agent response states (thinking, streaming, complete, confirm).
 */
import type { FooterSessionMetrics } from './reply-dispatcher-types';
import { type ToolUseDisplayStep } from './tool-use-display';
/**
 * Element ID used for the streaming text area in cards. The CardKit
 * `cardElement.content()` API targets this element for typewriter-effect
 * streaming updates.
 */
export declare const STREAMING_ELEMENT_ID = "streaming_content";
export declare const REASONING_ELEMENT_ID = "reasoning_content";
export interface CardElement {
    tag: string;
    [key: string]: unknown;
}
export interface FeishuCard {
    config: {
        wide_screen_mode: boolean;
        update_multi?: boolean;
        locales?: string[];
        summary?: {
            content: string;
        };
    };
    header?: {
        title: {
            tag: 'plain_text';
            content: string;
            i18n_content?: Record<string, string>;
        };
        template: string;
    };
    elements: CardElement[];
}
export type CardState = 'thinking' | 'streaming' | 'complete' | 'confirm';
export interface ConfirmData {
    operationDescription: string;
    pendingOperationId: string;
    preview?: string;
}
/**
 * Split a payload text into optional `reasoningText` and `answerText`.
 *
 * Handles two formats produced by the framework:
 * 1. "Reasoning:\n_italic line_\n…" prefix (from `formatReasoningMessage`)
 * 2. `<think>…</think>` / `<thinking>…</thinking>` XML tags
 *
 * Equivalent to the framework's `splitTelegramReasoningText()`.
 */
export declare function splitReasoningText(text?: string): {
    reasoningText?: string;
    answerText?: string;
};
/**
 * Strip reasoning blocks — both XML tags with their content and any
 * "Reasoning:\n" prefixed content.
 */
export declare function stripReasoningTags(text: string): string;
/**
 * Format reasoning duration into a human-readable i18n pair.
 * e.g. { zh: "思考了 3.2s", en: "Thought for 3.2s" }
 */
export declare function formatReasoningDuration(ms: number): {
    zh: string;
    en: string;
};
/**
 * Format tool-use duration into a human-readable i18n pair.
 */
export declare function formatToolUseDuration(ms: number): {
    zh: string;
    en: string;
};
/**
 * Format milliseconds into a human-readable duration string.
 */
export declare function formatElapsed(ms: number): string;
export declare function compactNumber(value: number): string;
export declare function formatFooterRuntimeSegments(params: {
    footer?: {
        status?: boolean;
        elapsed?: boolean;
        tokens?: boolean;
        cache?: boolean;
        context?: boolean;
        model?: boolean;
    };
    metrics?: FooterSessionMetrics;
    elapsedMs?: number;
    isError?: boolean;
    isAborted?: boolean;
}): {
    primaryZh: string[];
    primaryEn: string[];
    detailZh: string[];
    detailEn: string[];
};
/**
 * Build a full Feishu Interactive Message Card JSON object for the
 * given state.
 */
export declare function buildCardContent(state: CardState, data?: {
    text?: string;
    reasoningText?: string;
    reasoningElapsedMs?: number;
    toolUseSteps?: ToolUseDisplayStep[];
    toolUseTitleSuffix?: {
        zh: string;
        en: string;
    };
    toolUseElapsedMs?: number;
    showToolUse?: boolean;
    confirmData?: ConfirmData;
    elapsedMs?: number;
    isError?: boolean;
    isAborted?: boolean;
    footer?: {
        status?: boolean;
        elapsed?: boolean;
        tokens?: boolean;
        cache?: boolean;
        context?: boolean;
        model?: boolean;
    };
    footerMetrics?: FooterSessionMetrics;
}): FeishuCard;
/**
 * Convert an old-format FeishuCard to CardKit JSON 2.0 format.
 * JSON 2.0 uses `body.elements` instead of top-level `elements`.
 */
/**
 * Build the initial CardKit 2.0 streaming card with a loading icon.
 * Optionally includes a tool-use pending panel above the streaming area.
 */
export declare function buildStreamingThinkingCard(showToolUse?: boolean): Record<string, unknown>;
/**
 * Build a CardKit 2.0 card for the pre-answer streaming phase.
 * Used both for the initial card and for live updates during tool calls.
 */
export declare function buildStreamingPreAnswerCard(params: {
    steps?: ToolUseDisplayStep[];
    elapsedMs?: number;
    showToolUse?: boolean;
}): Record<string, unknown>;
export declare function toCardKit2(card: FeishuCard): Record<string, unknown>;
