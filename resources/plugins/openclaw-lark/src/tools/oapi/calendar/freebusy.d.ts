/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_calendar_freebusy tool -- Query user/room calendar free/busy status.
 *
 * P0 Actions: list
 *
 * Uses the Feishu Calendar API:
 *   - list: POST /open-apis/calendar/v4/freebusy/batch (批量查询接口)
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuCalendarFreebusyTool(api: OpenClawPluginApi): void;
