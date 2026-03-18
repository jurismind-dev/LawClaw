"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "video" and "media" message types.
 */
import { safeParse } from './utils';
import { formatDuration } from './utils';
export const convertVideo = (raw) => {
    const parsed = safeParse(raw);
    const fileKey = parsed?.file_key;
    if (!fileKey) {
        return { content: '[video]', resources: [] };
    }
    const fileName = parsed?.file_name ?? '';
    const duration = parsed?.duration;
    const coverKey = parsed?.image_key;
    const nameAttr = fileName ? ` name="${fileName}"` : '';
    const durationAttr = duration != null ? ` duration="${formatDuration(duration)}"` : '';
    return {
        content: `<video key="${fileKey}"${nameAttr}${durationAttr}/>`,
        resources: [
            {
                type: 'video',
                fileKey,
                fileName: fileName || undefined,
                duration: duration ?? undefined,
                coverImageKey: coverKey ?? undefined,
            },
        ],
    };
};
