/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Pure functions for resolving the Feishu reply mode.
 *
 * Extracted from reply-dispatcher.ts to enable independent testing
 * and eliminate `as any` casts on FeishuConfig.
 */
import type { FeishuConfig } from '../core/types';
type ReplyModeValue = 'auto' | 'static' | 'streaming';
/**
 * Resolve the effective reply mode based on configuration and chat type.
 *
 * Priority: replyMode.{scene} > replyMode.default > replyMode (string) > "auto"
 */
export declare function resolveReplyMode(params: {
    feishuCfg: FeishuConfig | undefined;
    chatType?: 'p2p' | 'group';
}): ReplyModeValue;
/**
 * Expand "auto" mode to a concrete mode based on streaming flag and chat type.
 *
 * When streaming === true: group → static, direct → streaming (legacy behavior).
 * When streaming is unset: always static (new default).
 */
export declare function expandAutoMode(params: {
    mode: ReplyModeValue;
    streaming: boolean | undefined;
    chatType?: 'p2p' | 'group';
}): 'static' | 'streaming';
/**
 * Detect whether the text contains markdown elements that benefit from
 * being rendered inside a Feishu interactive card (fenced code blocks or
 * markdown tables).
 */
export declare function shouldUseCard(text: string): boolean;
export {};
