/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_calendar_calendar tool -- Manage Feishu calendars.
 *
 * P0 Actions: list, get, primary
 *
 * Uses the Feishu Calendar API:
 *   - list:    GET  /open-apis/calendar/v4/calendars
 *   - get:     GET  /open-apis/calendar/v4/calendars/:calendar_id
 *   - primary: POST /open-apis/calendar/v4/calendars/primary
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuCalendarCalendarTool(api: OpenClawPluginApi): void;
