"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "image" message type.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertImage = void 0;
const utils_1 = require("./utils.js");
const convertImage = (raw) => {
    const parsed = (0, utils_1.safeParse)(raw);
    const imageKey = parsed?.image_key;
    if (!imageKey) {
        return { content: '[image]', resources: [] };
    }
    return {
        content: `![image](${imageKey})`,
        resources: [{ type: 'image', fileKey: imageKey }],
    };
};
exports.convertImage = convertImage;
