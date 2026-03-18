/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "post" (rich text) message type.
 *
 * Preserves structure as Markdown: links as `[text](href)`,
 * images as `![image](key)`, code blocks, and mention resolution.
 */
import type { ContentConverterFn } from './types';
export declare const convertPost: ContentConverterFn;
