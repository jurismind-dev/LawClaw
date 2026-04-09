"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_calendar_event_attendee tool -- Manage Feishu calendar event attendees.
 *
 * P0 Actions: create, list
 *
 * Uses the Feishu Calendar API:
 *   - create: POST /open-apis/calendar/v4/calendars/:calendar_id/events/:event_id/attendees
 *   - list:   GET  /open-apis/calendar/v4/calendars/:calendar_id/events/:event_id/attendees
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuCalendarEventAttendeeTool = registerFeishuCalendarEventAttendeeTool;
const typebox_1 = require("@sinclair/typebox");
const helpers_1 = require("../helpers.js");
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const FeishuCalendarEventAttendeeSchema = typebox_1.Type.Union([
    // CREATE
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('create'),
        calendar_id: typebox_1.Type.String({
            description: '日历 ID',
        }),
        event_id: typebox_1.Type.String({
            description: '日程 ID',
        }),
        attendees: typebox_1.Type.Array(typebox_1.Type.Object({
            type: (0, helpers_1.StringEnum)(['user', 'chat', 'resource', 'third_party']),
            attendee_id: typebox_1.Type.String({
                description: '参会人 ID。type=user 时为 open_id，type=chat 时为 chat_id，type=resource 时为会议室 ID，type=third_party 时为邮箱地址',
            }),
        }), {
            description: '参会人列表',
        }),
        need_notification: typebox_1.Type.Optional(typebox_1.Type.Boolean({
            description: '是否给参会人发送通知（默认 true）',
        })),
        attendee_ability: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['none', 'can_see_others', 'can_invite_others', 'can_modify_event'])),
    }),
    // LIST
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('list'),
        calendar_id: typebox_1.Type.String({
            description: '日历 ID',
        }),
        event_id: typebox_1.Type.String({
            description: '日程 ID',
        }),
        page_size: typebox_1.Type.Optional(typebox_1.Type.Number({
            description: '每页数量（默认 50，最大 500）',
        })),
        page_token: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '分页标记',
        })),
        user_id_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['open_id', 'union_id', 'user_id'])),
    }),
]);
// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
function registerFeishuCalendarEventAttendeeTool(api) {
    if (!api.config)
        return;
    const cfg = api.config;
    const { toolClient, log } = (0, helpers_1.createToolContext)(api, 'feishu_calendar_event_attendee');
    (0, helpers_1.registerTool)(api, {
        name: 'feishu_calendar_event_attendee',
        label: 'Feishu Calendar Event Attendees',
        description: '飞书日程参会人管理工具。当用户要求邀请/添加参会人、查看参会人列表时使用。Actions: create（添加参会人）, list（查询参会人列表）。',
        parameters: FeishuCalendarEventAttendeeSchema,
        async execute(_toolCallId, params) {
            const p = params;
            try {
                const client = toolClient();
                switch (p.action) {
                    // -----------------------------------------------------------------
                    // CREATE ATTENDEES
                    // -----------------------------------------------------------------
                    case 'create': {
                        if (!p.attendees || p.attendees.length === 0) {
                            return (0, helpers_1.json)({
                                error: 'attendees is required and cannot be empty',
                            });
                        }
                        log.info(`create: calendar_id=${p.calendar_id}, event_id=${p.event_id}, attendees_count=${p.attendees.length}`);
                        const attendeeData = p.attendees.map((a) => {
                            const base = {
                                type: a.type,
                                is_optional: false,
                            };
                            if (a.type === 'user') {
                                base.user_id = a.attendee_id;
                            }
                            else if (a.type === 'chat') {
                                base.chat_id = a.attendee_id;
                            }
                            else if (a.type === 'resource') {
                                base.room_id = a.attendee_id;
                            }
                            else if (a.type === 'third_party') {
                                base.third_party_email = a.attendee_id;
                            }
                            return base;
                        });
                        const res = await client.invoke('feishu_calendar_event.create', (sdk, opts) => sdk.calendar.calendarEventAttendee.create({
                            path: {
                                calendar_id: p.calendar_id,
                                event_id: p.event_id,
                            },
                            params: {
                                user_id_type: 'open_id',
                            },
                            data: {
                                attendees: attendeeData,
                                need_notification: p.need_notification ?? true,
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`create: added ${p.attendees.length} attendees to event ${p.event_id}`);
                        return (0, helpers_1.json)({
                            attendees: res.data?.attendees,
                        });
                    }
                    // -----------------------------------------------------------------
                    // LIST ATTENDEES
                    // -----------------------------------------------------------------
                    case 'list': {
                        log.info(`list: calendar_id=${p.calendar_id}, event_id=${p.event_id}, page_size=${p.page_size ?? 50}`);
                        const res = await client.invoke('feishu_calendar_event_attendee.list', (sdk, opts) => sdk.calendar.calendarEventAttendee.list({
                            path: {
                                calendar_id: p.calendar_id,
                                event_id: p.event_id,
                            },
                            params: {
                                page_size: p.page_size,
                                page_token: p.page_token,
                                user_id_type: (p.user_id_type || 'open_id'),
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        const data = res.data;
                        log.info(`list: returned ${data?.items?.length ?? 0} attendees`);
                        return (0, helpers_1.json)({
                            attendees: data?.items,
                            has_more: data?.has_more ?? false,
                            page_token: data?.page_token,
                        });
                    }
                }
            }
            catch (err) {
                return await (0, helpers_1.handleInvokeErrorWithAutoAuth)(err, cfg);
            }
        },
    }, { name: 'feishu_calendar_event_attendee' });
}
