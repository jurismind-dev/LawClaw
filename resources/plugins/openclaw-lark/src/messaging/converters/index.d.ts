/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Content converter mapping for all Feishu message types.
 */
import type { ContentConverterFn } from './types';
export declare const converters: ReadonlyMap<string, ContentConverterFn>;
