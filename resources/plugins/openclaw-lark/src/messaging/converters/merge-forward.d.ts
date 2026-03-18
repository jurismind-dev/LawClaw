/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "merge_forward" message type.
 *
 * Unlike other converters this is async — it fetches sub-messages via
 * the Feishu IM API and recursively expands nested merge_forward messages.
 *
 * The API returns ALL nested sub-messages in a single flat `items`
 * array with `upper_message_id` pointing to the parent container.
 * We build a tree from this flat list and recursively format it —
 * only one API call is needed regardless of nesting depth.
 *
 * This module is a pure "data → format" converter: all API capabilities
 * (`fetchSubMessages`, `batchResolveNames`, `resolveUserName`) are
 * injected via callbacks in `ConvertContext`. Callers are responsible
 * for creating the appropriate callbacks (UAT / TAT / event push).
 */
import type { ContentConverterFn } from './types';
/**
 * Recursively expand a merge_forward message.
 *
 * Output format aligns with the Go reference implementation:
 * ```
 * <forwarded_messages>
 * [RFC3339] sender_id:
 *     message content
 * </forwarded_messages>
 * ```
 */
export declare const convertMergeForward: ContentConverterFn;
