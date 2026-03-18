"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "audio" message type.
 */
import { safeParse } from './utils';
import { formatDuration } from './utils';
export const convertAudio = (raw) => {
    const parsed = safeParse(raw);
    const fileKey = parsed?.file_key;
    if (!fileKey) {
        return { content: '[audio]', resources: [] };
    }
    const duration = parsed?.duration;
    const durationAttr = duration != null ? ` duration="${formatDuration(duration)}"` : '';
    return {
        content: `<audio key="${fileKey}"${durationAttr}/>`,
        resources: [{ type: 'audio', fileKey, duration: duration ?? undefined }],
    };
};
