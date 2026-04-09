"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_task_subtask tool -- Manage Feishu task subtasks.
 *
 * P1 Actions: create, list
 *
 * Uses the Feishu Task v2 API:
 *   - create: POST /open-apis/task/v2/tasks/:task_guid/subtasks
 *   - list:   GET  /open-apis/task/v2/tasks/:task_guid/subtasks
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuTaskSubtaskTool = registerFeishuTaskSubtaskTool;
const typebox_1 = require("@sinclair/typebox");
const helpers_1 = require("../helpers.js");
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const FeishuTaskSubtaskSchema = typebox_1.Type.Union([
    // CREATE (P1)
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('create'),
        task_guid: typebox_1.Type.String({ description: '父任务 GUID' }),
        summary: typebox_1.Type.String({ description: '子任务标题' }),
        description: typebox_1.Type.Optional(typebox_1.Type.String({ description: '子任务描述' })),
        due: typebox_1.Type.Optional(typebox_1.Type.Object({
            timestamp: typebox_1.Type.String({
                description: "截止时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）",
            }),
            is_all_day: typebox_1.Type.Optional(typebox_1.Type.Boolean({ description: '是否为全天任务' })),
        })),
        start: typebox_1.Type.Optional(typebox_1.Type.Object({
            timestamp: typebox_1.Type.String({
                description: "开始时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）",
            }),
            is_all_day: typebox_1.Type.Optional(typebox_1.Type.Boolean({ description: '是否为全天' })),
        })),
        members: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.Object({
            id: typebox_1.Type.String({ description: '成员 open_id' }),
            role: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['assignee', 'follower'])),
        }), { description: '子任务成员列表（assignee=负责人，follower=关注人）' })),
    }),
    // LIST (P1)
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('list'),
        task_guid: typebox_1.Type.String({ description: '父任务 GUID' }),
        page_size: typebox_1.Type.Optional(typebox_1.Type.Number({ description: '每页数量，默认 50，最大 100' })),
        page_token: typebox_1.Type.Optional(typebox_1.Type.String({ description: '分页标记' })),
    }),
]);
// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
function registerFeishuTaskSubtaskTool(api) {
    if (!api.config)
        return;
    const cfg = api.config;
    const { toolClient, log } = (0, helpers_1.createToolContext)(api, 'feishu_task_subtask');
    (0, helpers_1.registerTool)(api, {
        name: 'feishu_task_subtask',
        label: 'Feishu Task Subtasks',
        description: '【以用户身份】飞书任务的子任务管理工具。当用户要求创建子任务、查询任务的子任务列表时使用。Actions: create（创建子任务）, list（列出任务的所有子任务）。',
        parameters: FeishuTaskSubtaskSchema,
        async execute(_toolCallId, params) {
            const p = params;
            try {
                const client = toolClient();
                switch (p.action) {
                    // -----------------------------------------------------------------
                    // CREATE
                    // -----------------------------------------------------------------
                    case 'create': {
                        log.info(`create: task_guid=${p.task_guid}, summary=${p.summary}`);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const data = {
                            summary: p.summary,
                        };
                        if (p.description) {
                            data.description = p.description;
                        }
                        // 转换截止时间
                        if (p.due) {
                            const dueTs = (0, helpers_1.parseTimeToTimestampMs)(p.due.timestamp);
                            if (!dueTs) {
                                return (0, helpers_1.json)({
                                    error: `时间格式错误！due.timestamp 必须使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'，当前值：${p.due.timestamp}`,
                                });
                            }
                            data.due = {
                                timestamp: dueTs,
                                is_all_day: p.due.is_all_day ?? false,
                            };
                        }
                        // 转换开始时间
                        if (p.start) {
                            const startTs = (0, helpers_1.parseTimeToTimestampMs)(p.start.timestamp);
                            if (!startTs) {
                                return (0, helpers_1.json)({
                                    error: `时间格式错误！start.timestamp 必须使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'，当前值：${p.start.timestamp}`,
                                });
                            }
                            data.start = {
                                timestamp: startTs,
                                is_all_day: p.start.is_all_day ?? false,
                            };
                        }
                        // 转换成员格式
                        if (p.members && p.members.length > 0) {
                            data.members = p.members.map((m) => ({
                                id: m.id,
                                type: 'user',
                                role: m.role || 'assignee',
                            }));
                        }
                        const res = await client.invoke('feishu_task_subtask.create', (sdk, opts) => sdk.task.v2.taskSubtask.create({
                            path: {
                                task_guid: p.task_guid,
                            },
                            params: {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                user_id_type: 'open_id',
                            },
                            data,
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`create: created subtask ${res.data?.subtask?.guid ?? 'unknown'}`);
                        return (0, helpers_1.json)({
                            subtask: res.data?.subtask,
                        });
                    }
                    // -----------------------------------------------------------------
                    // LIST
                    // -----------------------------------------------------------------
                    case 'list': {
                        log.info(`list: task_guid=${p.task_guid}, page_size=${p.page_size ?? 50}`);
                        const res = await client.invoke('feishu_task_subtask.list', (sdk, opts) => sdk.task.v2.taskSubtask.list({
                            path: {
                                task_guid: p.task_guid,
                            },
                            params: {
                                page_size: p.page_size,
                                page_token: p.page_token,
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                user_id_type: 'open_id',
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        const data = res.data;
                        log.info(`list: returned ${data?.items?.length ?? 0} subtasks`);
                        return (0, helpers_1.json)({
                            subtasks: data?.items,
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
    }, { name: 'feishu_task_subtask' });
}
