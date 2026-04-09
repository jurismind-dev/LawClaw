"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CardConverter = exports.MODE = void 0;
const utils_1 = require("../utils.js");
const types_1 = require("./types.js");
const card_utils_1 = require("./card-utils.js");
exports.MODE = { Concise: 0, Detailed: 1 };
const elementConverters = new Map([
    ['plain_text', (c, _elem, prop) => c.convertPlainText(prop)],
    ['markdown', (c, _elem, prop) => c.convertMarkdown(prop)],
    ['markdown_v1', (c, elem, prop) => c.convertMarkdownV1(elem, prop)],
    ['text', (c, _elem, prop) => c.convertPlainText(prop)],
    ['div', (c, _elem, prop, id) => c.convertDiv(prop, id)],
    ['note', (c, _elem, prop) => c.convertNote(prop)],
    ['hr', () => '---'],
    ['br', () => '\n'],
    ['column_set', (c, _elem, prop, _id, depth) => c.convertColumnSet(prop, depth)],
    ['column', (c, _elem, prop, _id, depth) => c.convertColumn(prop, depth)],
    ['person', (c, _elem, prop, id) => c.convertPerson(prop, id)],
    ['person_v1', (c, _elem, prop, id) => c.convertPersonV1(prop, id)],
    ['person_list', (c, _elem, prop) => c.convertPersonList(prop)],
    ['avatar', (c, _elem, prop, id) => c.convertAvatar(prop, id)],
    ['at', (c, _elem, prop) => c.convertAt(prop)],
    ['at_all', () => '@所有人'],
    ['button', (c, _elem, prop, id) => c.convertButton(prop, id)],
    ['actions', (c, _elem, prop) => c.convertActions(prop)],
    ['action', (c, _elem, prop) => c.convertActions(prop)],
    ['overflow', (c, _elem, prop) => c.convertOverflow(prop)],
    ['select_static', (c, _elem, prop, id) => c.convertSelect(prop, id, false)],
    ['multi_select_static', (c, _elem, prop, id) => c.convertSelect(prop, id, true)],
    ['select_person', (c, _elem, prop, id) => c.convertSelect(prop, id, false)],
    ['multi_select_person', (c, _elem, prop, id) => c.convertSelect(prop, id, true)],
    ['select_img', (c, _elem, prop, id) => c.convertSelectImg(prop, id)],
    ['input', (c, _elem, prop, id) => c.convertInput(prop, id)],
    ['date_picker', (c, _elem, prop, id) => c.convertDatePicker(prop, id, 'date')],
    ['picker_time', (c, _elem, prop, id) => c.convertDatePicker(prop, id, 'time')],
    ['picker_datetime', (c, _elem, prop, id) => c.convertDatePicker(prop, id, 'datetime')],
    ['checker', (c, _elem, prop, id) => c.convertChecker(prop, id)],
    ['img', (c, _elem, prop, id) => c.convertImage(prop, id)],
    ['image', (c, _elem, prop, id) => c.convertImage(prop, id)],
    ['img_combination', (c, _elem, prop) => c.convertImgCombination(prop)],
    ['table', (c, _elem, prop) => c.convertTable(prop)],
    ['chart', (c, _elem, prop, id) => c.convertChart(prop, id)],
    ['audio', (c, _elem, prop, id) => c.convertAudio(prop, id)],
    ['video', (c, _elem, prop, id) => c.convertVideo(prop, id)],
    ['collapsible_panel', (c, _elem, prop, id) => c.convertCollapsiblePanel(prop, id)],
    ['form', (c, _elem, prop, id) => c.convertForm(prop, id)],
    ['interactive_container', (c, _elem, prop, id) => c.convertInteractiveContainer(prop, id)],
    ['text_tag', (c, _elem, prop) => c.convertTextTag(prop)],
    ['number_tag', (c, _elem, prop) => c.convertNumberTag(prop)],
    ['link', (c, _elem, prop) => c.convertLink(prop)],
    ['emoji', (c, _elem, prop) => c.convertEmoji(prop)],
    ['local_datetime', (c, _elem, prop) => c.convertLocalDatetime(prop)],
    ['list', (c, _elem, prop) => c.convertList(prop)],
    ['blockquote', (c, _elem, prop) => c.convertBlockquote(prop)],
    ['code_block', (c, _elem, prop) => c.convertCodeBlock(prop)],
    ['code_span', (c, _elem, prop) => c.convertCodeSpan(prop)],
    ['heading', (c, _elem, prop) => c.convertHeading(prop)],
    ['fallback_text', (c, _elem, prop) => c.convertFallbackText(prop)],
    ['repeat', (c, _elem, prop) => c.convertRepeat(prop)],
    ['card_header', () => ''],
    ['custom_icon', () => ''],
    ['standard_icon', () => ''],
]);
class CardConverter {
    mode;
    attachment;
    constructor(mode) {
        this.mode = mode;
    }
    convert(input) {
        const card = (0, utils_1.safeParse)(input.json_card);
        if (!card) {
            return { content: '<card>\n[无法解析卡片内容]\n</card>', schema: 0 };
        }
        if (input.json_attachment) {
            this.attachment = (0, utils_1.safeParse)(input.json_attachment);
        }
        let schema = input.card_schema ?? 0;
        if (schema === 0) {
            const s = card.schema;
            schema = typeof s === 'number' ? s : 1;
        }
        const header = card.header;
        const title = header ? this.extractHeaderTitle(header, schema) : '';
        const body = this.extractBody(card, schema);
        const bodyContent = body ? this.convertBody(body, schema) : '';
        let out = title ? `<card title="${(0, card_utils_1.escapeAttr)(title)}">\n` : '<card>\n';
        if (bodyContent)
            out += bodyContent + '\n';
        out += '</card>';
        return { content: out, schema };
    }
    extractBody(card, _schema) {
        if (card.body && typeof card.body === 'object') {
            return card.body;
        }
        return undefined;
    }
    extractHeaderTitle(header, _schema) {
        const prop = header.property;
        if (prop) {
            const titleElem = prop.title;
            if (titleElem)
                return this.extractTextContent(titleElem);
        }
        else {
            const titleElem = header.title;
            if (titleElem)
                return this.extractTextContent(titleElem);
        }
        return '';
    }
    convertBody(body, _schema) {
        let elements;
        const prop = body.property;
        if (prop) {
            const e = prop.elements;
            if (Array.isArray(e) && e.length > 0)
                elements = e;
        }
        if (!elements || elements.length === 0) {
            const e = body.elements;
            if (Array.isArray(e))
                elements = e;
        }
        if (!elements || elements.length === 0)
            return '';
        return this.convertElements(elements, 0);
    }
    convertElements(elements, depth) {
        const results = [];
        for (const elem of elements) {
            if (typeof elem !== 'object' || elem == null)
                continue;
            const result = this.convertElement(elem, depth);
            if (result)
                results.push(result);
        }
        return results.join('\n');
    }
    convertElement(elem, depth) {
        const tag = elem.tag ?? '';
        const id = elem.id ?? '';
        const prop = this.extractProperty(elem);
        const fn = elementConverters.get(tag);
        if (fn)
            return fn(this, elem, prop, id, depth);
        return this.convertUnknown(prop, tag);
    }
    extractProperty(elem) {
        if (elem.property && typeof elem.property === 'object') {
            return elem.property;
        }
        return elem;
    }
    extractTextContent(textElem) {
        if (textElem == null)
            return '';
        if (typeof textElem === 'string')
            return textElem;
        if (typeof textElem === 'object') {
            const m = textElem;
            if (m.property && typeof m.property === 'object') {
                return this.extractTextFromProperty(m.property);
            }
            return this.extractTextFromProperty(m);
        }
        return '';
    }
    extractTextFromProperty(prop) {
        const i18n = prop.i18nContent;
        if (i18n && typeof i18n === 'object') {
            for (const lang of ['zh_cn', 'en_us', 'ja_jp']) {
                const t = i18n[lang];
                if (typeof t === 'string' && t)
                    return t;
            }
        }
        if (typeof prop.content === 'string')
            return prop.content;
        const elements = prop.elements;
        if (Array.isArray(elements) && elements.length > 0) {
            const texts = [];
            for (const elem of elements) {
                if (typeof elem === 'object' && elem != null) {
                    const t = this.extractTextContent(elem);
                    if (t)
                        texts.push(t);
                }
            }
            return texts.join('');
        }
        if (typeof prop.text === 'string')
            return prop.text;
        return '';
    }
    convertPlainText(prop) {
        const content = prop.content;
        if (!content)
            return '';
        const style = this.extractTextStyle(prop);
        return this.applyTextStyle(content, style);
    }
    convertMarkdown(prop) {
        const elements = prop.elements;
        if (Array.isArray(elements) && elements.length > 0) {
            return this.convertMarkdownElements(elements);
        }
        if (typeof prop.content === 'string')
            return prop.content;
        return '';
    }
    convertMarkdownV1(elem, prop) {
        const elements = prop.elements;
        if (Array.isArray(elements) && elements.length > 0) {
            return this.convertMarkdownElements(elements);
        }
        const fallback = elem.fallback;
        if (fallback && typeof fallback === 'object') {
            return this.convertElement(fallback, 0);
        }
        if (typeof prop.content === 'string')
            return prop.content;
        return '';
    }
    convertMarkdownElements(elements) {
        const parts = [];
        for (const elem of elements) {
            if (typeof elem !== 'object' || elem == null)
                continue;
            const result = this.convertElement(elem, 0);
            if (result)
                parts.push(result);
        }
        return parts.join('');
    }
    convertDiv(prop, _id) {
        const results = [];
        const textElem = prop.text;
        if (textElem && typeof textElem === 'object') {
            const text = this.convertElement(textElem, 0);
            if (text)
                results.push(text);
        }
        const fields = prop.fields;
        if (Array.isArray(fields) && fields.length > 0) {
            const fieldTexts = [];
            for (const field of fields) {
                if (typeof field !== 'object' || field == null)
                    continue;
                const fm = field;
                const te = fm.text;
                if (te && typeof te === 'object') {
                    const ft = this.convertElement(te, 0);
                    if (ft)
                        fieldTexts.push(ft);
                }
            }
            if (fieldTexts.length > 0)
                results.push(fieldTexts.join('\n'));
        }
        const extraElem = prop.extra;
        if (extraElem && typeof extraElem === 'object') {
            const extra = this.convertElement(extraElem, 0);
            if (extra)
                results.push(extra);
        }
        return results.join('\n');
    }
    convertNote(prop) {
        const elements = prop.elements;
        if (!Array.isArray(elements) || elements.length === 0)
            return '';
        const texts = [];
        for (const elem of elements) {
            if (typeof elem !== 'object' || elem == null)
                continue;
            const text = this.convertElement(elem, 0);
            if (text)
                texts.push(text);
        }
        if (texts.length === 0)
            return '';
        return `📝 ${texts.join(' ')}`;
    }
    convertLink(prop) {
        const content = prop.content || '链接';
        let url = '';
        const urlObj = prop.url;
        if (urlObj && typeof urlObj === 'object') {
            url = urlObj.url || '';
        }
        if (url)
            return `[${content}](${url})`;
        return content;
    }
    convertEmoji(prop) {
        const key = prop.key || '';
        return types_1.EMOJI_MAP[key] ?? `:${key}:`;
    }
    convertLocalDatetime(prop) {
        const milliseconds = prop.milliseconds;
        const fallbackText = prop.fallbackText;
        if (milliseconds) {
            const formatted = (0, card_utils_1.formatMillisecondsToISO8601)(milliseconds);
            if (formatted)
                return formatted;
        }
        return fallbackText || '';
    }
    convertList(prop) {
        const items = prop.items;
        if (!Array.isArray(items) || items.length === 0)
            return '';
        const lines = [];
        for (const item of items) {
            if (typeof item !== 'object' || item == null)
                continue;
            const im = item;
            const level = im.level || 0;
            const listType = im.type || '';
            const order = im.order || 0;
            const indent = '  '.repeat(level);
            const marker = listType === 'ol' ? `${Math.floor(order)}.` : '-';
            const elements = im.elements;
            if (Array.isArray(elements)) {
                const content = this.convertMarkdownElements(elements);
                lines.push(`${indent}${marker} ${content}`);
            }
        }
        return lines.join('\n');
    }
    convertBlockquote(prop) {
        let content = '';
        if (typeof prop.content === 'string') {
            content = prop.content;
        }
        else {
            const elements = prop.elements;
            if (Array.isArray(elements)) {
                content = this.convertMarkdownElements(elements);
            }
        }
        if (!content)
            return '';
        return content
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n');
    }
    convertCodeBlock(prop) {
        const language = prop.language || 'plaintext';
        let code = '';
        const contents = prop.contents;
        if (Array.isArray(contents)) {
            for (const line of contents) {
                if (typeof line !== 'object' || line == null)
                    continue;
                const lm = line;
                const lineContents = lm.contents;
                if (Array.isArray(lineContents)) {
                    for (const c of lineContents) {
                        if (typeof c !== 'object' || c == null)
                            continue;
                        const cm = c;
                        if (typeof cm.content === 'string')
                            code += cm.content;
                    }
                }
            }
        }
        return `\`\`\`${language}\n${code}\`\`\``;
    }
    convertCodeSpan(prop) {
        const content = prop.content || '';
        return `\`${content}\``;
    }
    convertHeading(prop) {
        let level = prop.level || 1;
        if (level < 1)
            level = 1;
        if (level > 6)
            level = 6;
        let content = '';
        if (typeof prop.content === 'string') {
            content = prop.content;
        }
        else {
            const elements = prop.elements;
            if (Array.isArray(elements)) {
                content = this.convertMarkdownElements(elements);
            }
        }
        return `${'#'.repeat(level)} ${content}`;
    }
    convertFallbackText(prop) {
        const textElem = prop.text;
        if (textElem && typeof textElem === 'object') {
            return this.extractTextContent(textElem);
        }
        const elements = prop.elements;
        if (Array.isArray(elements)) {
            return this.convertMarkdownElements(elements);
        }
        return '';
    }
    convertTextTag(prop) {
        const textElem = prop.text;
        let text = '';
        if (textElem && typeof textElem === 'object') {
            text = this.extractTextContent(textElem);
        }
        if (!text)
            return '';
        return `「${text}」`;
    }
    convertNumberTag(prop) {
        const textElem = prop.text;
        let text = '';
        if (textElem && typeof textElem === 'object') {
            text = this.extractTextContent(textElem);
        }
        if (!text)
            return '';
        const urlObj = prop.url;
        if (urlObj && typeof urlObj === 'object') {
            const url = urlObj.url;
            if (url)
                return `[${text}](${url})`;
        }
        return text;
    }
    convertUnknown(prop, tag) {
        if (!prop) {
            if (this.mode === exports.MODE.Detailed)
                return `[未知内容](tag:${tag})`;
            return '[未知内容]';
        }
        const paths = ['content', 'text', 'title', 'label', 'placeholder'];
        for (const path of paths) {
            if (prop[path] != null) {
                const text = this.extractTextContent(prop[path]);
                if (text)
                    return text;
            }
        }
        const elements = prop.elements;
        if (Array.isArray(elements) && elements.length > 0) {
            return this.convertElements(elements, 0);
        }
        if (this.mode === exports.MODE.Detailed)
            return `[未知内容](tag:${tag})`;
        return '[未知内容]';
    }
    convertColumnSet(prop, depth) {
        const columns = prop.columns;
        if (!Array.isArray(columns) || columns.length === 0)
            return '';
        const results = [];
        for (const col of columns) {
            if (typeof col !== 'object' || col == null)
                continue;
            const result = this.convertElement(col, depth + 1);
            if (result)
                results.push(result);
        }
        return results.join('\n\n');
    }
    convertColumn(prop, depth) {
        const elements = prop.elements;
        if (!Array.isArray(elements) || elements.length === 0)
            return '';
        return this.convertElements(elements, depth);
    }
    convertForm(prop, _id) {
        let out = '<form>\n';
        const elements = prop.elements;
        if (Array.isArray(elements)) {
            out += this.convertElements(elements, 0);
        }
        out += '\n</form>';
        return out;
    }
    convertCollapsiblePanel(prop, _id) {
        const expanded = prop.expanded === true;
        let title = '详情';
        const header = prop.header;
        if (header && typeof header === 'object') {
            const titleElem = header.title;
            if (titleElem) {
                const t = this.extractTextContent(titleElem);
                if (t)
                    title = t;
            }
        }
        const shouldExpand = expanded || this.mode === exports.MODE.Detailed;
        if (shouldExpand) {
            let out = `▼ ${title}\n`;
            const elements = prop.elements;
            if (Array.isArray(elements)) {
                const content = this.convertElements(elements, 1);
                for (const line of content.split('\n')) {
                    if (line)
                        out += `    ${line}\n`;
                }
            }
            out += '▲';
            return out;
        }
        return `▶ ${title}`;
    }
    convertInteractiveContainer(prop, _id) {
        let url = '';
        const actions = prop.actions;
        if (Array.isArray(actions) && actions.length > 0) {
            const action = actions[0];
            if (action && typeof action === 'object') {
                const actionType = action.type;
                if (actionType === 'open_url') {
                    const actionData = action.action;
                    if (actionData && typeof actionData === 'object') {
                        url = actionData.url || '';
                    }
                }
            }
        }
        let out = '<clickable';
        if (url)
            out += ` url="${(0, card_utils_1.escapeAttr)(url)}"`;
        if (this.mode === exports.MODE.Detailed && _id)
            out += ` id="${_id}"`;
        out += '>\n';
        const elements = prop.elements;
        if (Array.isArray(elements)) {
            out += this.convertElements(elements, 0);
        }
        out += '\n</clickable>';
        return out;
    }
    convertRepeat(prop) {
        const elements = prop.elements;
        if (Array.isArray(elements)) {
            return this.convertElements(elements, 0);
        }
        return '';
    }
    convertButton(prop, _id) {
        let buttonText = '';
        const textElem = prop.text;
        if (textElem && typeof textElem === 'object') {
            buttonText = this.extractTextContent(textElem);
        }
        if (!buttonText)
            buttonText = '按钮';
        const disabled = prop.disabled === true;
        if (disabled && this.mode === exports.MODE.Concise) {
            return `[${buttonText} ✗]`;
        }
        const actions = prop.actions;
        if (Array.isArray(actions)) {
            for (const action of actions) {
                if (typeof action !== 'object' || action == null)
                    continue;
                const am = action;
                if (am.type === 'open_url') {
                    const ad = am.action;
                    if (ad && typeof ad === 'object') {
                        const url = ad.url;
                        if (url)
                            return `[${buttonText}](${url})`;
                    }
                }
            }
        }
        if (disabled && this.mode === exports.MODE.Detailed) {
            let result = `[${buttonText} ✗]`;
            const tips = prop.disabledTips;
            if (tips && typeof tips === 'object') {
                const tipsText = this.extractTextContent(tips);
                if (tipsText)
                    result += `(tips:"${tipsText}")`;
            }
            return result;
        }
        return `[${buttonText}]`;
    }
    convertActions(prop) {
        const actions = prop.actions;
        if (!Array.isArray(actions) || actions.length === 0)
            return '';
        const results = [];
        for (const action of actions) {
            if (typeof action !== 'object' || action == null)
                continue;
            const result = this.convertElement(action, 0);
            if (result)
                results.push(result);
        }
        return results.join(' ');
    }
    convertSelect(prop, _id, isMulti) {
        const options = prop.options || [];
        const selectedValues = new Set();
        if (isMulti) {
            const vals = prop.selectedValues;
            if (Array.isArray(vals)) {
                for (const v of vals) {
                    if (typeof v === 'string')
                        selectedValues.add(v);
                }
            }
        }
        else {
            const initialOption = prop.initialOption;
            if (typeof initialOption === 'string')
                selectedValues.add(initialOption);
            const initialIndex = prop.initialIndex;
            if (typeof initialIndex === 'number' && initialIndex >= 0 && initialIndex < options.length) {
                const opt = options[initialIndex];
                if (opt && typeof opt === 'object') {
                    const val = opt.value;
                    if (val)
                        selectedValues.add(val);
                }
            }
        }
        const optionTexts = [];
        let hasSelected = false;
        for (const opt of options) {
            if (typeof opt !== 'object' || opt == null)
                continue;
            const om = opt;
            let optText = '';
            const textElem = om.text;
            if (textElem && typeof textElem === 'object') {
                optText = this.extractTextContent(textElem);
            }
            if (!optText)
                optText = om.value || '';
            if (!optText)
                continue;
            const value = om.value || '';
            if (selectedValues.has(value)) {
                optText = '✓' + optText;
                hasSelected = true;
            }
            optionTexts.push(optText);
        }
        if (optionTexts.length === 0) {
            let placeholder = '请选择';
            const phElem = prop.placeholder;
            if (phElem && typeof phElem === 'object') {
                const ph = this.extractTextContent(phElem);
                if (ph)
                    placeholder = ph;
            }
            optionTexts.push(placeholder + ' ▼');
        }
        else if (!hasSelected) {
            optionTexts[optionTexts.length - 1] += ' ▼';
        }
        let result = `{${optionTexts.join(' / ')}}`;
        if (this.mode === exports.MODE.Detailed) {
            const attrs = [];
            if (isMulti)
                attrs.push('multi');
            if (_id.includes('person') || prop.type === 'person')
                attrs.push('type:person');
            if (attrs.length > 0)
                result += `(${attrs.join(' ')})`;
        }
        return result;
    }
    convertSelectImg(prop, _id) {
        const options = prop.options;
        if (!Array.isArray(options))
            return '';
        const selectedValues = new Set();
        const vals = prop.selectedValues;
        if (Array.isArray(vals)) {
            for (const v of vals) {
                if (typeof v === 'string')
                    selectedValues.add(v);
            }
        }
        const optTexts = [];
        for (let i = 0; i < options.length; i++) {
            const opt = options[i];
            if (!opt || typeof opt !== 'object')
                continue;
            const value = opt.value || '';
            let text = `🖼️图${i + 1}`;
            if (selectedValues.has(value))
                text = '✓' + text;
            optTexts.push(text);
        }
        return `{${optTexts.join(' / ')}}`;
    }
    convertInput(prop, _id) {
        let label = '';
        const labelElem = prop.label;
        if (labelElem && typeof labelElem === 'object') {
            label = this.extractTextContent(labelElem);
        }
        const defaultValue = prop.defaultValue || '';
        let placeholder = '';
        const phElem = prop.placeholder;
        if (phElem && typeof phElem === 'object') {
            placeholder = this.extractTextContent(phElem);
        }
        let result;
        if (defaultValue) {
            result = defaultValue + '___';
        }
        else if (placeholder) {
            result = placeholder + '_____';
        }
        else {
            result = '_____';
        }
        if (label)
            result = label + ': ' + result;
        const inputType = prop.inputType;
        if (inputType === 'multiline_text') {
            result = result.replace(/_____/g, '...');
        }
        return result;
    }
    convertDatePicker(prop, _id, pickerType) {
        let emoji;
        let value = '';
        switch (pickerType) {
            case 'date':
                emoji = '📅';
                value = prop.initialDate || '';
                break;
            case 'time':
                emoji = '🕐';
                value = prop.initialTime || '';
                break;
            case 'datetime':
                emoji = '📅';
                value = prop.initialDatetime || '';
                break;
            default:
                emoji = '📅';
        }
        if (value)
            value = (0, card_utils_1.normalizeTimeFormat)(value);
        if (!value) {
            let placeholder = '选择';
            const phElem = prop.placeholder;
            if (phElem && typeof phElem === 'object') {
                const ph = this.extractTextContent(phElem);
                if (ph)
                    placeholder = ph;
            }
            value = placeholder;
        }
        return `${emoji} ${value}`;
    }
    convertChecker(prop, _id) {
        const checked = prop.checked === true;
        const checkMark = checked ? '[x]' : '[ ]';
        let text = '';
        const textElem = prop.text;
        if (textElem && typeof textElem === 'object') {
            text = this.extractTextContent(textElem);
        }
        let result = `${checkMark} ${text}`;
        if (this.mode === exports.MODE.Detailed && _id) {
            result += `(id:${_id})`;
        }
        return result;
    }
    convertOverflow(prop) {
        const options = prop.options;
        if (!Array.isArray(options) || options.length === 0)
            return '';
        const optTexts = [];
        for (const opt of options) {
            if (typeof opt !== 'object' || opt == null)
                continue;
            const om = opt;
            const textElem = om.text;
            if (textElem && typeof textElem === 'object') {
                const text = this.extractTextContent(textElem);
                if (text)
                    optTexts.push(text);
            }
        }
        return `⋮ ${optTexts.join(', ')}`;
    }
    convertPerson(prop, _id) {
        const userID = prop.userID || '';
        if (!userID)
            return '';
        let personName = '';
        if (this.attachment) {
            const persons = this.attachment.persons;
            if (persons && typeof persons === 'object') {
                const person = persons[userID];
                if (person && typeof person === 'object') {
                    const content = person.content;
                    if (content)
                        personName = content;
                }
            }
        }
        if (!personName) {
            const notation = prop.notation;
            if (notation && typeof notation === 'object') {
                personName = this.extractTextContent(notation);
            }
        }
        if (personName) {
            if (this.mode === exports.MODE.Detailed)
                return `@${personName}(open_id:${userID})`;
            return `@${personName}`;
        }
        if (this.mode === exports.MODE.Detailed)
            return `@用户(open_id:${userID})`;
        return `@${userID}`;
    }
    convertPersonV1(prop, _id) {
        const userID = prop.userID || '';
        if (!userID)
            return '';
        let personName = '';
        if (this.attachment) {
            const persons = this.attachment.persons;
            if (persons && typeof persons === 'object') {
                const person = persons[userID];
                if (person && typeof person === 'object') {
                    const content = person.content;
                    if (content)
                        personName = content;
                }
            }
        }
        if (personName) {
            if (this.mode === exports.MODE.Detailed)
                return `@${personName}(open_id:${userID})`;
            return `@${personName}`;
        }
        if (this.mode === exports.MODE.Detailed)
            return `@用户(open_id:${userID})`;
        return `@${userID}`;
    }
    convertPersonList(prop) {
        const persons = prop.persons;
        if (!Array.isArray(persons) || persons.length === 0)
            return '';
        const names = [];
        for (const person of persons) {
            if (typeof person !== 'object' || person == null)
                continue;
            const pm = person;
            const personID = pm.id || '';
            const name = '用户';
            if (this.mode === exports.MODE.Detailed && personID) {
                names.push(`@${name}(id:${personID})`);
            }
            else {
                names.push(`@${name}`);
            }
        }
        return names.join(', ');
    }
    convertAvatar(prop, _id) {
        const userID = prop.userID || '';
        let result = '👤';
        if (this.mode === exports.MODE.Detailed && userID) {
            result += `(id:${userID})`;
        }
        return result;
    }
    convertAt(prop) {
        const userID = prop.userID || '';
        if (!userID)
            return '';
        let userName = '';
        let actualUserID = '';
        if (this.attachment) {
            const atUsers = this.attachment.at_users;
            if (atUsers && typeof atUsers === 'object') {
                const userInfo = atUsers[userID];
                if (userInfo && typeof userInfo === 'object') {
                    const content = userInfo.content;
                    if (content)
                        userName = content;
                    const uid = userInfo.user_id;
                    if (uid)
                        actualUserID = uid;
                }
            }
        }
        if (userName) {
            if (this.mode === exports.MODE.Detailed) {
                if (actualUserID)
                    return `@${userName}(user_id:${actualUserID})`;
                return `@${userName}(open_id:${userID})`;
            }
            return `@${userName}`;
        }
        if (this.mode === exports.MODE.Detailed) {
            if (actualUserID)
                return `@用户(user_id:${actualUserID})`;
            return `@用户(open_id:${userID})`;
        }
        return `@${userID}`;
    }
    convertImage(prop, _id) {
        let alt = '图片';
        const altElem = prop.alt;
        if (altElem && typeof altElem === 'object') {
            const altText = this.extractTextContent(altElem);
            if (altText)
                alt = altText;
        }
        const titleElem = prop.title;
        if (titleElem && typeof titleElem === 'object') {
            const titleText = this.extractTextContent(titleElem);
            if (titleText)
                alt = titleText;
        }
        let result = `🖼️ ${alt}`;
        if (this.mode === exports.MODE.Detailed) {
            const imageID = prop.imageID;
            if (imageID) {
                const token = this.getImageToken(imageID);
                if (token) {
                    result += `(img_token:${token})`;
                }
                else {
                    result += `(img_key:${imageID})`;
                }
            }
        }
        return result;
    }
    convertImgCombination(prop) {
        const imgList = prop.imgList;
        if (!Array.isArray(imgList) || imgList.length === 0)
            return '';
        let result = `🖼️ ${imgList.length}张图片`;
        if (this.mode === exports.MODE.Detailed) {
            const keys = [];
            for (const img of imgList) {
                if (typeof img !== 'object' || img == null)
                    continue;
                const im = img;
                const imageID = im.imageID;
                if (imageID)
                    keys.push(imageID);
            }
            if (keys.length > 0)
                result += `(keys:${keys.join(',')})`;
        }
        return result;
    }
    convertChart(prop, _id) {
        let title = '图表';
        let chartType = '';
        const chartSpec = prop.chartSpec;
        if (chartSpec && typeof chartSpec === 'object') {
            const titleObj = chartSpec.title;
            if (titleObj && typeof titleObj === 'object') {
                const text = titleObj.text;
                if (text)
                    title = text;
            }
            const ct = chartSpec.type;
            if (ct) {
                chartType = ct;
                const typeName = types_1.CHART_TYPE_NAMES[chartType];
                if (typeName)
                    title = `${title}${typeName}`;
            }
        }
        const summary = this.extractChartSummary(prop, chartType);
        let result = `📊 ${title}`;
        if (summary)
            result += `\n数据摘要: ${summary}`;
        return result;
    }
    extractChartSummary(prop, chartType) {
        const chartSpec = prop.chartSpec;
        if (!chartSpec || typeof chartSpec !== 'object')
            return '';
        const dataObj = chartSpec.data;
        if (!dataObj || typeof dataObj !== 'object')
            return '';
        const values = dataObj.values;
        if (!Array.isArray(values) || values.length === 0)
            return '';
        switch (chartType) {
            case 'line':
            case 'bar':
            case 'area':
                return this.extractLineBarSummary(chartSpec, values);
            case 'pie':
                return this.extractPieSummary(chartSpec, values);
            default:
                return this.extractGenericSummary(values);
        }
    }
    extractLineBarSummary(chartSpec, values) {
        const xField = chartSpec.xField;
        const yField = chartSpec.yField;
        if (!xField || !yField || values.length === 0) {
            return this.extractGenericSummary(values);
        }
        const parts = [];
        for (const v of values) {
            if (typeof v !== 'object' || v == null)
                continue;
            const vm = v;
            parts.push(`${vm[xField]}:${vm[yField]}`);
        }
        return parts.length > 0 ? parts.join(', ') : this.extractGenericSummary(values);
    }
    extractPieSummary(chartSpec, values) {
        const categoryField = chartSpec.categoryField;
        const valueField = chartSpec.valueField;
        if (!categoryField || !valueField || values.length === 0) {
            return this.extractGenericSummary(values);
        }
        const parts = [];
        for (const v of values) {
            if (typeof v !== 'object' || v == null)
                continue;
            const vm = v;
            parts.push(`${vm[categoryField]}:${vm[valueField]}`);
        }
        return parts.length > 0 ? parts.join(', ') : this.extractGenericSummary(values);
    }
    extractGenericSummary(values) {
        return `${values.length}个数据点`;
    }
    convertAudio(prop, _id) {
        let result = '🎵 音频';
        if (this.mode === exports.MODE.Detailed) {
            const fileID = prop.fileID || prop.audioID || '';
            if (fileID)
                result += `(key:${fileID})`;
        }
        return result;
    }
    convertVideo(prop, _id) {
        let result = '🎬 视频';
        if (this.mode === exports.MODE.Detailed) {
            const fileID = prop.fileID || prop.videoID || '';
            if (fileID)
                result += `(key:${fileID})`;
        }
        return result;
    }
    convertTable(prop) {
        const columns = prop.columns;
        if (!Array.isArray(columns) || columns.length === 0)
            return '';
        const rows = prop.rows || [];
        const colNames = [];
        const colKeys = [];
        for (const col of columns) {
            if (typeof col !== 'object' || col == null)
                continue;
            const cm = col;
            let displayName = cm.displayName || '';
            const name = cm.name || '';
            if (!displayName)
                displayName = name;
            colNames.push(displayName);
            colKeys.push(name);
        }
        const lines = [];
        lines.push('| ' + colNames.join(' | ') + ' |');
        lines.push('|' + colNames.map(() => '------|').join(''));
        for (const row of rows) {
            if (typeof row !== 'object' || row == null)
                continue;
            const rm = row;
            const cells = [];
            for (const key of colKeys) {
                let cellValue = '';
                const cellData = rm[key];
                if (cellData && typeof cellData === 'object') {
                    if (cellData.data != null) {
                        cellValue = this.extractTableCellValue(cellData.data);
                    }
                }
                cells.push(cellValue);
            }
            lines.push('| ' + cells.join(' | ') + ' |');
        }
        return lines.join('\n');
    }
    extractTableCellValue(data) {
        if (typeof data === 'string')
            return data;
        if (typeof data === 'number')
            return data.toFixed(2);
        if (Array.isArray(data)) {
            const texts = [];
            for (const item of data) {
                if (typeof item === 'object' && item != null) {
                    const im = item;
                    if (typeof im.text === 'string')
                        texts.push(`「${im.text}」`);
                }
            }
            return texts.join(' ');
        }
        if (typeof data === 'object' && data != null) {
            return this.extractTextContent(data);
        }
        return '';
    }
    extractTextStyle(prop) {
        const style = {
            bold: false,
            italic: false,
            strikethrough: false,
        };
        const textStyle = prop.textStyle;
        if (!textStyle || typeof textStyle !== 'object')
            return style;
        const attrs = textStyle.attributes;
        if (Array.isArray(attrs)) {
            for (const attr of attrs) {
                if (typeof attr !== 'string')
                    continue;
                switch (attr) {
                    case 'bold':
                        style.bold = true;
                        break;
                    case 'italic':
                        style.italic = true;
                        break;
                    case 'strikethrough':
                        style.strikethrough = true;
                        break;
                }
            }
        }
        return style;
    }
    applyTextStyle(content, style) {
        if (!content)
            return content;
        if (style.strikethrough)
            content = `~~${content}~~`;
        if (style.italic)
            content = `*${content}*`;
        if (style.bold)
            content = `**${content}**`;
        return content;
    }
    getImageToken(imageID) {
        if (!this.attachment)
            return '';
        const images = this.attachment.images;
        if (!images || typeof images !== 'object')
            return '';
        const imageInfo = images[imageID];
        if (!imageInfo || typeof imageInfo !== 'object')
            return '';
        return imageInfo.token || '';
    }
}
exports.CardConverter = CardConverter;
