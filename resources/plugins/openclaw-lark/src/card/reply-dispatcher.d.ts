/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Reply dispatcher factory for the Lark/Feishu channel plugin.
 *
 * Thin factory function that:
 * 1. Resolves account, reply mode, and typing indicator config
 * 2. In streaming mode, delegates to StreamingCardController
 * 3. In static mode, delivers via sendMessageFeishu / sendMarkdownCardFeishu
 * 4. Assembles and returns FeishuReplyDispatcherResult
 */
import type { CreateFeishuReplyDispatcherParams, FeishuReplyDispatcherResult } from './reply-dispatcher-types';
export type { CreateFeishuReplyDispatcherParams } from './reply-dispatcher-types';
export declare function createFeishuReplyDispatcher(params: CreateFeishuReplyDispatcherParams): FeishuReplyDispatcherResult;
