"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "file" message type.
 */
import { safeParse } from './utils';
export const convertFile = (raw) => {
    const parsed = safeParse(raw);
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
