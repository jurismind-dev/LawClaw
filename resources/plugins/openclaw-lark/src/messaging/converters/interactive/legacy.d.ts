/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Legacy card converter for non-raw_card_content format.
 */
import type { Obj } from './types';
export declare function convertLegacyCard(parsed: Obj): {
    content: string;
    resources: never[];
};
