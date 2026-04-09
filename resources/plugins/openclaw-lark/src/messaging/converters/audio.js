"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "audio" message type.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertAudio = void 0;
const utils_1 = require("./utils.js");
const convertAudio = (raw) => {
    const parsed = (0, utils_1.safeParse)(raw);
    const fileKey = parsed?.file_key;
    if (!fileKey) {
        return { content: '[audio]', resources: [] };
    }
    const duration = parsed?.duration;
    const durationAttr = duration != null ? ` duration="${(0, utils_1.formatDuration)(duration)}"` : '';
    return {
        content: `<audio key="${fileKey}"${durationAttr}/>`,
        resources: [{ type: 'audio', fileKey, duration: duration ?? undefined }],
    };
};
exports.convertAudio = convertAudio;
