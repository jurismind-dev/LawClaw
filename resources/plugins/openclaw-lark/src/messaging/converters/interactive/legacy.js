"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Legacy card converter for non-raw_card_content format.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertLegacyCard = convertLegacyCard;
function convertLegacyCard(parsed) {
    const texts = [];
    const header = parsed.header;
    if (header) {
        const title = header.title;
        if (title && typeof title.content === 'string') {
            texts.push(`**${title.content}**`);
        }
    }
    const body = parsed.body;
    const elements = (parsed.elements ?? body?.elements ?? []);
    extractTexts(elements, texts);
    const content = texts.length > 0 ? texts.join('\n') : '[interactive card]';
    return { content, resources: [] };
}
function extractTexts(elements, out) {
    if (!Array.isArray(elements))
        return;
    for (const el of elements) {
        if (typeof el !== 'object' || el == null)
            continue;
        const elem = el;
        if (elem.tag === 'markdown' && typeof elem.content === 'string') {
            out.push(elem.content);
            continue;
        }
        if (elem.tag === 'div' || elem.tag === 'plain_text' || elem.tag === 'lark_md') {
            const text = elem.text;
            if (text?.content && typeof text.content === 'string') {
                out.push(text.content);
            }
            if (typeof elem.content === 'string') {
                out.push(elem.content);
            }
        }
        if (elem.tag === 'column_set') {
            const columns = elem.columns;
            if (columns) {
                for (const col of columns) {
                    const colObj = col;
                    if (colObj.elements) {
                        extractTexts(colObj.elements, out);
                    }
                }
            }
        }
        if (elem.elements) {
            extractTexts(elem.elements, out);
        }
    }
}
