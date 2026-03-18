"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "image" message type.
 */
import { safeParse } from './utils';
export const convertImage = (raw) => {
    const parsed = safeParse(raw);
    const imageKey = parsed?.image_key;
    if (!imageKey) {
        return { content: '[image]', resources: [] };
    }
    return {
        content: `![image](${imageKey})`,
        resources: [{ type: 'image', fileKey: imageKey }],
    };
};
