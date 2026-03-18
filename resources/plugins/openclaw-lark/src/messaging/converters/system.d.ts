/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "system" message type.
 *
 * System messages use a template string with placeholders like
 * `{from_user}`, `{to_chatters}`, `{divider_text}` that are replaced
 * with actual values from the message body.
 */
import type { ContentConverterFn } from './types';
export declare const convertSystem: ContentConverterFn;
