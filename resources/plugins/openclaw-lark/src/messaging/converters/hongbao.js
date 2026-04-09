"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "hongbao" (red packet) message type.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertHongbao = void 0;
const utils_1 = require("./utils.js");
const convertHongbao = (raw) => {
    const parsed = (0, utils_1.safeParse)(raw);
    const text = parsed?.text;
    const textAttr = text ? ` text="${text}"` : '';
    return {
        content: `<hongbao${textAttr}/>`,
        resources: [],
    };
};
exports.convertHongbao = convertHongbao;
