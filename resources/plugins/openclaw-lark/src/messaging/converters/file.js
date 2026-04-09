"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "file" message type.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertFile = void 0;
const utils_1 = require("./utils.js");
const convertFile = (raw) => {
    const parsed = (0, utils_1.safeParse)(raw);
    const fileKey = parsed?.file_key;
    if (!fileKey) {
        return { content: '[file]', resources: [] };
    }
    const fileName = parsed?.file_name ?? '';
    const nameAttr = fileName ? ` name="${fileName}"` : '';
    return {
        content: `<file key="${fileKey}"${nameAttr}/>`,
        resources: [{ type: 'file', fileKey, fileName: fileName || undefined }],
    };
};
exports.convertFile = convertFile;
