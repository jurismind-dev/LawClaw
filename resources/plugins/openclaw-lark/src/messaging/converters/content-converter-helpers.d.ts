/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Shared helper functions for Feishu content converters.
 */
import type { ApiMessageItem, ConvertContext } from './types';
/** 从 mention 的 id 字段提取 open_id（兼容事件推送的对象格式和 API 响应的字符串格式） */
export declare function extractMentionOpenId(id: unknown): string;
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
