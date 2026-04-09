"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "text" message type.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertText = void 0;
const content_converter_helpers_1 = require("./content-converter-helpers.js");
const utils_1 = require("./utils.js");
const convertText = (raw, ctx) => {
    const parsed = (0, utils_1.safeParse)(raw);
    const text = parsed?.text ?? raw;
    const content = (0, content_converter_helpers_1.resolveMentions)(text, ctx);
    return { content, resources: [] };
};
exports.convertText = convertText;
