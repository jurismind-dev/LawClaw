"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "folder" message type.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertFolder = void 0;
const utils_1 = require("./utils.js");
const convertFolder = (raw) => {
    const parsed = (0, utils_1.safeParse)(raw);
    const fileKey = parsed?.file_key;
    if (!fileKey) {
        return { content: '[folder]', resources: [] };
    }
    const fileName = parsed?.file_name ?? '';
    const nameAttr = fileName ? ` name="${fileName}"` : '';
    return {
        content: `<folder key="${fileKey}"${nameAttr}/>`,
        resources: [],
    };
};
exports.convertFolder = convertFolder;
