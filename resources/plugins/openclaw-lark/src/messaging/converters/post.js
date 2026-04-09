"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "post" (rich text) message type.
 *
 * Preserves structure as Markdown: links as `[text](href)`,
 * images as `![image](key)`, code blocks, and mention resolution.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertPost = void 0;
const content_converter_helpers_1 = require("./content-converter-helpers.js");
const utils_1 = require("./utils.js");
/** Preferred locale order for multi-language post unwrapping. */
const LOCALE_PRIORITY = ['zh_cn', 'en_us', 'ja_jp'];
/**
 * Unwrap a parsed post object that may be locale-wrapped.
 *
 * Feishu post messages come in two shapes:
 *   - Flat:   `{ title, content }`
 *   - Locale: `{ zh_cn: { title, content }, en_us: { title, content } }`
 */
function unwrapLocale(parsed) {
    if ('title' in parsed || 'content' in parsed) {
        return parsed;
    }
    for (const locale of LOCALE_PRIORITY) {
        const localeData = parsed[locale];
        if (localeData != null && typeof localeData === 'object') {
            return localeData;
        }
    }
    const firstKey = Object.keys(parsed)[0];
    if (firstKey) {
        const firstValue = parsed[firstKey];
        if (firstValue != null && typeof firstValue === 'object') {
            return firstValue;
        }
    }
    return undefined;
}
const convertPost = (raw, ctx) => {
    const rawParsed = (0, utils_1.safeParse)(raw);
    if (rawParsed == null || typeof rawParsed !== 'object') {
        return { content: '[rich text message]', resources: [] };
    }
    const parsed = unwrapLocale(rawParsed);
    if (!parsed) {
        return { content: '[rich text message]', resources: [] };
    }
    const resources = [];
    const lines = [];
    // Title
    if (parsed.title) {
        lines.push(`**${parsed.title}**`, '');
    }
    const contentBlocks = parsed.content ?? [];
    for (const paragraph of contentBlocks) {
        if (!Array.isArray(paragraph))
            continue;
        let line = '';
        for (const el of paragraph) {
            line += renderElement(el, ctx, resources);
        }
        lines.push(line);
    }
    let content = lines.join('\n').trim() || '[rich text message]';
    content = (0, content_converter_helpers_1.resolveMentions)(content, ctx);
    return { content, resources };
};
exports.convertPost = convertPost;
function renderElement(el, ctx, resources) {
    switch (el.tag) {
        case 'text': {
            let text = el.text ?? '';
            text = applyStyle(text, el.style);
            return text;
        }
        case 'a': {
            const text = el.text ?? el.href ?? '';
            return el.href ? `[${text}](${el.href})` : text;
        }
        case 'at': {
            // At-mention in post — use placeholder key if available via context,
            // otherwise fall back to @user_name.
            const userId = el.user_id ?? '';
            if (userId === 'all')
                return '@all';
            const name = el.user_name ?? userId;
            // O(1) lookup via reverse map
            const info = ctx.mentionsByOpenId.get(userId);
            if (info) {
                // Let resolveMentions handle it — return the placeholder key
                return info.key;
            }
            return `@${name}`;
        }
        case 'img': {
            if (el.image_key) {
                resources.push({ type: 'image', fileKey: el.image_key });
                return `![image](${el.image_key})`;
            }
            return '';
        }
        case 'media': {
            if (el.file_key) {
                resources.push({ type: 'file', fileKey: el.file_key });
                return `<file key="${el.file_key}"/>`;
            }
            return '';
        }
        case 'code_block': {
            const lang = el.language ?? '';
            const code = el.text ?? '';
            return `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
        }
        case 'hr':
            return '\n---\n';
        default:
            return el.text ?? '';
    }
}
function applyStyle(text, style) {
    if (!style || style.length === 0)
        return text;
    let result = text;
    if (style.includes('bold'))
        result = `**${result}**`;
    if (style.includes('italic'))
        result = `*${result}*`;
    if (style.includes('underline'))
        result = `<u>${result}</u>`;
    if (style.includes('lineThrough'))
        result = `~~${result}~~`;
    if (style.includes('codeInline'))
        result = `\`${result}\``;
    return result;
}
