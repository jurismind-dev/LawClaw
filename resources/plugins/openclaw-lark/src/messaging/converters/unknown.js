"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Fallback converter for unsupported message types.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertUnknown = void 0;
const utils_1 = require("./utils.js");
const convertUnknown = (raw) => {
    const parsed = (0, utils_1.safeParse)(raw);
    if (parsed != null && typeof parsed === 'object' && 'text' in parsed) {
        const text = parsed.text;
        if (typeof text === 'string')
            return { content: text, resources: [] };
    }
    return { content: '[unsupported message]', resources: [] };
};
exports.convertUnknown = convertUnknown;
