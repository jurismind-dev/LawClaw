"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "sticker" message type.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertSticker = void 0;
const utils_1 = require("./utils.js");
const convertSticker = (raw) => {
    const parsed = (0, utils_1.safeParse)(raw);
    const fileKey = parsed?.file_key;
    if (!fileKey) {
        return { content: '[sticker]', resources: [] };
    }
    return {
        content: `<sticker key="${fileKey}"/>`,
        resources: [{ type: 'sticker', fileKey }],
    };
};
exports.convertSticker = convertSticker;
