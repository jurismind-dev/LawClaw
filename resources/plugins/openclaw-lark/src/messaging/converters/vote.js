"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "vote" message type.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertVote = void 0;
const utils_1 = require("./utils.js");
const convertVote = (raw) => {
    const parsed = (0, utils_1.safeParse)(raw);
    const topic = parsed?.topic ?? '';
    const options = parsed?.options ?? [];
    const parts = [];
    if (topic) {
        parts.push(topic);
    }
    for (const opt of options) {
        parts.push(`• ${opt}`);
    }
    const inner = parts.join('\n') || '[vote]';
    return {
        content: `<vote>\n${inner}\n</vote>`,
        resources: [],
    };
};
exports.convertVote = convertVote;
