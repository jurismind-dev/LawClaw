/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * I/O adapters for inbound message parsing.
 *
 * Contains API-calling functions that are used during the parse phase
 * but separated from the pure parsing logic in parse.ts.
 */
import type { LarkClient as LarkClientType } from '../../core/lark-client';
import type { LarkAccount } from '../../core/types';
/** Shape of a single message item returned by the im/v1/messages API. */
export interface ApiMessageItem {
    message_id?: string;
    msg_type?: string;
    body?: {
        content?: string;
    };
    sender?: {
        id?: string;
        sender_type?: string;
    };
    [key: string]: unknown;
}
/**
 * 对 interactive 消息，通过 TAT 调用 API 获取完整 v2 卡片内容。
 * 事件推送的 content 可能不包含 json_card，API 调用可返回完整的 raw_card_content。
 * 失败时返回 undefined，调用方 fallback 到原始 content。
 *
 * Note: `larkClient.sdk` 的类型定义不暴露 raw `request` 方法，
 * 因此这里使用 `as any` 断言调用。
 */
export declare function fetchCardContent(messageId: string, larkClient: LarkClientType): Promise<string | undefined>;
/**
 * Create a `fetchSubMessages` callback for use in `ConvertContext`.
 *
 * The returned function calls the im/v1/messages API to fetch
 * sub-messages of a merge_forward message.
 *
 * Note: `larkClient.sdk` 的类型定义不暴露 raw `request` 方法，
 * 因此这里使用 `as any` 断言调用。
 */
export declare function createFetchSubMessages(larkClient: LarkClientType): (msgId: string) => Promise<ApiMessageItem[]>;
/**
 * Create a `batchResolveNames` callback for use in `ConvertContext`.
 *
 * Wraps `createBatchResolveNames` from user-name-cache.ts, providing
 * the account and log function.
 */
export declare function createParseResolveNames(account: LarkAccount): (openIds: string[]) => Promise<void>;
