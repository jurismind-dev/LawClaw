"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * I/O adapters for inbound message parsing.
 *
 * Contains API-calling functions that are used during the parse phase
 * but separated from the pure parsing logic in parse.ts.
 */
import { larkLogger } from '../../core/lark-logger';
import { createBatchResolveNames } from './user-name-cache';
const log = larkLogger('inbound/parse-io');
// ---------------------------------------------------------------------------
// Card content fetcher
// ---------------------------------------------------------------------------
/**
 * 对 interactive 消息，通过 TAT 调用 API 获取完整 v2 卡片内容。
 * 事件推送的 content 可能不包含 json_card，API 调用可返回完整的 raw_card_content。
 * 失败时返回 undefined，调用方 fallback 到原始 content。
 *
 * Note: `larkClient.sdk` 的类型定义不暴露 raw `request` 方法，
 * 因此这里使用 `as any` 断言调用。
 */
export async function fetchCardContent(messageId, larkClient) {
    try {
        // SDK 类型不暴露 raw request 方法，需要 as any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await larkClient.sdk.request({
            method: 'GET',
            url: `/open-apis/im/v1/messages/${messageId}`,
            params: {
                user_id_type: 'open_id',
                card_msg_content_type: 'raw_card_content',
            },
        });
        return response?.data?.items?.[0]?.body?.content ?? undefined;
    }
    catch (err) {
        log.warn(`fetchCardContent failed for ${messageId}: ${err instanceof Error ? err.message : String(err)}`);
        return undefined;
    }
}
// ---------------------------------------------------------------------------
// Sub-message fetcher (for merge_forward)
// ---------------------------------------------------------------------------
/**
 * Create a `fetchSubMessages` callback for use in `ConvertContext`.
 *
 * The returned function calls the im/v1/messages API to fetch
 * sub-messages of a merge_forward message.
 *
 * Note: `larkClient.sdk` 的类型定义不暴露 raw `request` 方法，
 * 因此这里使用 `as any` 断言调用。
 */
export function createFetchSubMessages(larkClient) {
    return async (msgId) => {
        // SDK 类型不暴露 raw request 方法，需要 as any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await larkClient.sdk.request({
            method: 'GET',
            url: `/open-apis/im/v1/messages/${msgId}`,
            params: { user_id_type: 'open_id', card_msg_content_type: 'raw_card_content' },
        });
        if (response?.code !== 0) {
            throw new Error(`API error: code=${response?.code} msg=${response?.msg}`);
        }
        return response?.data?.items ?? [];
    };
}
// ---------------------------------------------------------------------------
// Batch resolve names callback factory
// ---------------------------------------------------------------------------
/**
 * Create a `batchResolveNames` callback for use in `ConvertContext`.
 *
 * Wraps `createBatchResolveNames` from user-name-cache.ts, providing
 * the account and log function.
 */
export function createParseResolveNames(account) {
    return createBatchResolveNames(account, (...args) => log.info(args.map(String).join(' ')));
}
