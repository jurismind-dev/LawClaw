"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converters for calendar-related message types:
 * - share_calendar_event
 * - calendar
 * - general_calendar
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertGeneralCalendar = exports.convertCalendar = exports.convertShareCalendarEvent = void 0;
const utils_1 = require("./utils.js");
function formatCalendarContent(parsed) {
    const summary = parsed?.summary ?? '';
    const parts = [];
    if (summary) {
        parts.push(`📅 ${summary}`);
    }
    const start = parsed?.start_time ? (0, utils_1.millisToDatetime)(parsed.start_time) : '';
    const end = parsed?.end_time ? (0, utils_1.millisToDatetime)(parsed.end_time) : '';
    if (start && end) {
        parts.push(`🕙 ${start} ~ ${end}`);
    }
    else if (start) {
        parts.push(`🕙 ${start}`);
    }
    return parts.join('\n') || '[calendar event]';
}
const convertShareCalendarEvent = (raw) => {
    const parsed = (0, utils_1.safeParse)(raw);
    const inner = formatCalendarContent(parsed);
    return {
        content: `<calendar_share>${inner}</calendar_share>`,
        resources: [],
    };
};
exports.convertShareCalendarEvent = convertShareCalendarEvent;
const convertCalendar = (raw) => {
    const parsed = (0, utils_1.safeParse)(raw);
    const inner = formatCalendarContent(parsed);
    return {
        content: `<calendar_invite>${inner}</calendar_invite>`,
        resources: [],
    };
};
exports.convertCalendar = convertCalendar;
const convertGeneralCalendar = (raw) => {
    const parsed = (0, utils_1.safeParse)(raw);
    const inner = formatCalendarContent(parsed);
    return {
        content: `<calendar>${inner}</calendar>`,
        resources: [],
    };
};
exports.convertGeneralCalendar = convertGeneralCalendar;
