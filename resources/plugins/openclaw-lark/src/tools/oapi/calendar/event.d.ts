/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_calendar_event tool -- Manage Feishu calendar events.
 *
 * P0 Actions: create, list, get
 *
 * Uses the Feishu Calendar API:
 *   - create: POST /open-apis/calendar/v4/calendars/:calendar_id/events
 *             POST /open-apis/calendar/v4/calendars/:calendar_id/events/:event_id/attendees/batch_create
 *   - list:   GET  /open-apis/calendar/v4/calendars/:calendar_id/events/instance_view
 *   - get:    GET  /open-apis/calendar/v4/calendars/:calendar_id/events/:event_id
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuCalendarEventTool(api: OpenClawPluginApi): void;
