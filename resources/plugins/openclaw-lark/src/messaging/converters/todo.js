"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "todo" message type.
 */
import { safeParse, millisToDatetime } from './utils';
/** Extract plain text from post-style content blocks. */
function extractPlainText(content) {
    const lines = [];
    for (const paragraph of content) {
        if (!Array.isArray(paragraph))
            continue;
        let line = '';
        for (const el of paragraph) {
            if (el.text)
                line += el.text;
        }
        lines.push(line);
    }
    return lines.join('\n').trim();
}
export const convertTodo = (raw) => {
    const parsed = safeParse(raw);
    const parts = [];
    // Build title from summary.title and summary.content
    const title = parsed?.summary?.title ?? '';
    const body = parsed?.summary?.content ? extractPlainText(parsed.summary.content) : '';
    const fullTitle = [title, body].filter(Boolean).join('\n');
    if (fullTitle) {
        parts.push(fullTitle);
    }
    if (parsed?.due_time) {
        parts.push(`Due: ${millisToDatetime(parsed.due_time)}`);
    }
    const inner = parts.join('\n') || '[todo]';
    return {
        content: `<todo>\n${inner}\n</todo>`,
        resources: [],
    };
};
