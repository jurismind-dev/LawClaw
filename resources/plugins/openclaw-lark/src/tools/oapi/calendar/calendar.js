"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuCalendarCalendarTool = registerFeishuCalendarCalendarTool;
const typebox_1 = require("@sinclair/typebox");
const helpers_1 = require("../helpers.js");
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const FeishuCalendarCalendarSchema = typebox_1.Type.Union([
    // LIST
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('list'),
        page_size: typebox_1.Type.Optional(typebox_1.Type.Number({
            description: 'Number of calendars to return per page (default: 50, max: 1000)',
        })),
        page_token: typebox_1.Type.Optional(typebox_1.Type.String({
            description: 'Pagination token for next page',
        })),
    }),
    // GET
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('get'),
        calendar_id: typebox_1.Type.String({
            description: 'Calendar ID',
        }),
    }),
    // PRIMARY
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('primary'),
    }),
]);
// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
function registerFeishuCalendarCalendarTool(api) {
    if (!api.config)
        return;
    const cfg = api.config;
    const { toolClient, log } = (0, helpers_1.createToolContext)(api, 'feishu_calendar_calendar');
    (0, helpers_1.registerTool)(api, {
        name: 'feishu_calendar_calendar',
        label: 'Feishu Calendar Management',
        description: '【以用户身份】飞书日历管理工具。用于查询日历列表、获取日历信息、查询主日历。Actions: list（查询日历列表）, get（查询指定日历信息）, primary（查询主日历信息）。',
        parameters: FeishuCalendarCalendarSchema,
        async execute(_toolCallId, params) {
            const p = params;
            try {
                const client = toolClient();
                switch (p.action) {
                    // -----------------------------------------------------------------
                    // LIST CALENDARS
                    // -----------------------------------------------------------------
                    case 'list': {
                        log.info(`list: page_size=${p.page_size ?? 50}, page_token=${p.page_token ?? 'none'}`);
                        const res = await client.invoke('feishu_calendar_calendar.list', (sdk, opts) => sdk.calendar.calendar.list({
                            params: {
                                page_size: p.page_size,
                                page_token: p.page_token,
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        const data = res.data;
                        const calendars = data?.calendar_list ?? [];
                        log.info(`list: returned ${calendars.length} calendars`);
                        return (0, helpers_1.json)({
                            calendars,
                            has_more: data?.has_more ?? false,
                            page_token: data?.page_token,
                        });
                    }
                    // -----------------------------------------------------------------
                    // GET CALENDAR
                    // -----------------------------------------------------------------
                    case 'get': {
                        if (!p.calendar_id) {
                            return (0, helpers_1.json)({
                                error: "calendar_id is required for 'get' action",
                            });
                        }
                        log.info(`get: calendar_id=${p.calendar_id}`);
                        const res = await client.invoke('feishu_calendar_calendar.get', (sdk, opts) => sdk.calendar.calendar.get({
                            path: { calendar_id: p.calendar_id },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`get: retrieved calendar ${p.calendar_id}`);
                        const data = res.data;
                        return (0, helpers_1.json)({
                            calendar: data?.calendar ?? res.data,
                        });
                    }
                    // -----------------------------------------------------------------
                    // PRIMARY CALENDAR
                    // -----------------------------------------------------------------
                    case 'primary': {
                        log.info(`primary: querying primary calendar`);
                        const res = await client.invoke('feishu_calendar_calendar.primary', (sdk, opts) => sdk.calendar.calendar.primary({}, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        const data = res.data;
                        const calendars = data?.calendars ?? [];
                        log.info(`primary: returned ${calendars.length} primary calendars`);
                        return (0, helpers_1.json)({
                            calendars,
                        });
                    }
                }
            }
            catch (err) {
                return await (0, helpers_1.handleInvokeErrorWithAutoAuth)(err, cfg);
            }
        },
    }, { name: 'feishu_calendar_calendar' });
}
