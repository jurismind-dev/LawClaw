/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_calendar_event_attendee tool -- Manage Feishu calendar event attendees.
 *
 * P0 Actions: create, list
 * P1 Actions: batch_delete
 *
 * Uses the Feishu Calendar API:
 *   - create: POST /open-apis/calendar/v4/calendars/:calendar_id/events/:event_id/attendees
 *   - list:   GET  /open-apis/calendar/v4/calendars/:calendar_id/events/:event_id/attendees
 *   - batch_delete: POST /open-apis/calendar/v4/calendars/:calendar_id/events/:event_id/attendees/batch_delete
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuCalendarEventAttendeeTool(api: OpenClawPluginApi): void;
