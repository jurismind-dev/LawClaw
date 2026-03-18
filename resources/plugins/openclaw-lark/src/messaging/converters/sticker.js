"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "sticker" message type.
 */
import { safeParse } from './utils';
export const convertSticker = (raw) => {
    const parsed = safeParse(raw);
    const fileKey = parsed?.file_key;
    if (!fileKey) {
        return { content: '[sticker]', resources: [] };
    }
    return {
        content: `<sticker key="${fileKey}"/>`,
        resources: [{ type: 'sticker', fileKey }],
    };
};
