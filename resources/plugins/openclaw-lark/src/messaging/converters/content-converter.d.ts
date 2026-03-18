/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Content converter for Feishu messages.
 *
 * Each message type (text, post, image, etc.) has a dedicated converter
 * function that parses raw JSON content into an AI-friendly text
 * representation plus a list of resource descriptors.
 *
 * This module is a general-purpose message parsing utility — usable
 * from inbound handling, outbound formatting, and skills.
 */
import type { ApiMessageItem, ConvertContext, ConvertResult } from './types';
export type { ApiMessageItem, ConvertContext, ConvertResult, ContentConverterFn } from './types';
/** 从 mention 的 id 字段提取 open_id（兼容事件推送的对象格式和 API 响应的字符串格式） */
export declare function extractMentionOpenId(id: unknown): string;
/**
 * Convert raw message content using the converter for the given message
 * type. Falls back to the "unknown" converter for unrecognised types.
 *
 * Returns a Promise because some converters (e.g. merge_forward) perform
 * async operations. Synchronous converters are awaited transparently.
 */
export declare function convertMessageContent(raw: string, messageType: string, ctx: ConvertContext): Promise<ConvertResult>;
/**
 * Build a {@link ConvertContext} from a raw Feishu API message item.
 *
 * Extracts the `mentions` array that the IM API returns on each message
 * item and maps it into the key→MentionInfo / openId→MentionInfo
 * structures the converter system expects.
 */
export declare function buildConvertContextFromItem(item: ApiMessageItem, fallbackMessageId: string, accountId?: string): ConvertContext;
/**
 * Resolve mention placeholders in text.
 *
 * - Bot mentions: remove the placeholder key and any preceding `@botName`
 *   entirely (with trailing whitespace).
 * - Non-bot mentions: replace the placeholder key with readable `@name`.
 */
export declare function resolveMentions(text: string, ctx: ConvertContext): string;
