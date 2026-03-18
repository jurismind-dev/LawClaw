"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "video_chat" message type.
 */
import { safeParse, millisToDatetime } from './utils';
export const convertVideoChat = (raw) => {
    const parsed = safeParse(raw);
    const topic = parsed?.topic ?? '';
    const parts = [];
    if (topic) {
        parts.push(`📹 ${topic}`);
    }
    if (parsed?.start_time) {
        parts.push(`🕙 ${millisToDatetime(parsed.start_time)}`);
    }
    const inner = parts.join('\n') || '[video chat]';
    return {
        content: `<meeting>${inner}</meeting>`,
        resources: [],
    };
};
