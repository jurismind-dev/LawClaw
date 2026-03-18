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
import { safeParse, millisToDatetime } from './utils';
function formatCalendarContent(parsed) {
    const summary = parsed?.summary ?? '';
    const parts = [];
    if (summary) {
        parts.push(`📅 ${summary}`);
    }
    const start = parsed?.start_time ? millisToDatetime(parsed.start_time) : '';
    const end = parsed?.end_time ? millisToDatetime(parsed.end_time) : '';
    if (start && end) {
        parts.push(`🕙 ${start} ~ ${end}`);
    }
    else if (start) {
        parts.push(`🕙 ${start}`);
    }
    return parts.join('\n') || '[calendar event]';
}
export const convertShareCalendarEvent = (raw) => {
    const parsed = safeParse(raw);
    const inner = formatCalendarContent(parsed);
    return {
        content: `<calendar_share>${inner}</calendar_share>`,
        resources: [],
    };
};
export const convertCalendar = (raw) => {
    const parsed = safeParse(raw);
    const inner = formatCalendarContent(parsed);
    return {
        content: `<calendar_invite>${inner}</calendar_invite>`,
        resources: [],
    };
};
export const convertGeneralCalendar = (raw) => {
    const parsed = safeParse(raw);
    const inner = formatCalendarContent(parsed);
    return {
        content: `<calendar>${inner}</calendar>`,
        resources: [],
    };
};
