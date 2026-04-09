"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_task_task tool -- Manage Feishu tasks.
 *
 * P0 Actions: create, get, list, patch
 *
 * Uses the Feishu Task v2 API:
 *   - create: POST /open-apis/task/v2/tasks
 *   - get:    GET  /open-apis/task/v2/tasks/:task_guid
 *   - list:   GET  /open-apis/task/v2/tasks
 *   - patch:  PATCH /open-apis/task/v2/tasks/:task_guid
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuTaskTaskTool = registerFeishuTaskTaskTool;
const typebox_1 = require("@sinclair/typebox");
const helpers_1 = require("../helpers.js");
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const FeishuTaskTaskSchema = typebox_1.Type.Union([
    // CREATE
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('create'),
        summary: typebox_1.Type.String({
            description: '任务标题',
        }),
        current_user_id: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '当前用户的 open_id（强烈建议，从消息上下文的 SenderId 获取）。如果 members 中不包含此用户，工具会自动添加为 follower，确保创建者可以编辑任务。',
        })),
        description: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '任务描述',
        })),
        due: typebox_1.Type.Optional(typebox_1.Type.Object({
            timestamp: typebox_1.Type.String({
                description: "截止时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）",
            }),
            is_all_day: typebox_1.Type.Optional(typebox_1.Type.Boolean({
                description: '是否为全天任务',
            })),
        })),
        start: typebox_1.Type.Optional(typebox_1.Type.Object({
            timestamp: typebox_1.Type.String({
                description: "开始时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）",
            }),
            is_all_day: typebox_1.Type.Optional(typebox_1.Type.Boolean({
                description: '是否为全天',
            })),
        })),
        members: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.Object({
            id: typebox_1.Type.String({
                description: '成员 open_id',
            }),
            role: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['assignee', 'follower'])),
        }), {
            description: '任务成员列表（assignee=负责人，follower=关注人）',
        })),
        repeat_rule: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '重复规则（RRULE 格式）',
        })),
        tasklists: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.Object({
            tasklist_guid: typebox_1.Type.String({
                description: '清单 GUID',
            }),
            section_guid: typebox_1.Type.Optional(typebox_1.Type.String({
                description: '分组 GUID',
            })),
        }), {
            description: '任务所属清单列表',
        })),
        user_id_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['open_id', 'union_id', 'user_id'])),
    }),
    // GET
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('get'),
        task_guid: typebox_1.Type.String({
            description: 'Task GUID',
        }),
        user_id_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['open_id', 'union_id', 'user_id'])),
    }),
    // LIST
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('list'),
        page_size: typebox_1.Type.Optional(typebox_1.Type.Number({
            description: '每页数量（默认 50，最大 100）。',
        })),
        page_token: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '分页标记',
        })),
        completed: typebox_1.Type.Optional(typebox_1.Type.Boolean({
            description: '是否筛选已完成任务',
        })),
        user_id_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['open_id', 'union_id', 'user_id'])),
    }),
    // PATCH
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('patch'),
        task_guid: typebox_1.Type.String({
            description: 'Task GUID',
        }),
        summary: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '新的任务标题',
        })),
        description: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '新的任务描述',
        })),
        due: typebox_1.Type.Optional(typebox_1.Type.Object({
            timestamp: typebox_1.Type.String({
                description: "新的截止时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）",
            }),
            is_all_day: typebox_1.Type.Optional(typebox_1.Type.Boolean({
                description: '是否为全天任务',
            })),
        })),
        start: typebox_1.Type.Optional(typebox_1.Type.Object({
            timestamp: typebox_1.Type.String({
                description: "新的开始时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）",
            }),
            is_all_day: typebox_1.Type.Optional(typebox_1.Type.Boolean({
                description: '是否为全天',
            })),
        })),
        completed_at: typebox_1.Type.Optional(typebox_1.Type.String({
            description: "完成时间。支持三种格式：1) ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'（设为已完成）；2) '0'（反完成，任务变为未完成）；3) 毫秒时间戳字符串。",
        })),
        members: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.Object({
            id: typebox_1.Type.String({
                description: '成员 open_id',
            }),
            role: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['assignee', 'follower'])),
        }), {
            description: '新的任务成员列表',
        })),
        repeat_rule: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '新的重复规则（RRULE 格式）',
        })),
        user_id_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['open_id', 'union_id', 'user_id'])),
    }),
]);
// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
function registerFeishuTaskTaskTool(api) {
    if (!api.config)
        return;
    const cfg = api.config;
    const { toolClient, log } = (0, helpers_1.createToolContext)(api, 'feishu_task_task');
    (0, helpers_1.registerTool)(api, {
        name: 'feishu_task_task',
        label: 'Feishu Task Management',
        description: "【以用户身份】飞书任务管理工具。用于创建、查询、更新任务。Actions: create（创建任务）, get（获取任务详情）, list（查询任务列表，仅返回我负责的任务）, patch（更新任务）。时间参数使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'。",
        parameters: FeishuTaskTaskSchema,
        async execute(_toolCallId, params) {
            const p = params;
            try {
                const client = toolClient();
                switch (p.action) {
                    // -----------------------------------------------------------------
                    // CREATE TASK
                    // -----------------------------------------------------------------
                    case 'create': {
                        log.info(`create: summary=${p.summary}`);
                        const taskData = {
                            summary: p.summary,
                        };
                        if (p.description)
                            taskData.description = p.description;
                        // Handle due time conversion
                        if (p.due?.timestamp) {
                            const dueTs = (0, helpers_1.parseTimeToTimestampMs)(p.due.timestamp);
                            if (!dueTs) {
                                return (0, helpers_1.json)({
                                    error: "due 时间格式错误！必须使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'，例如 '2026-02-25 18:00'。",
                                    received: p.due.timestamp,
                                });
                            }
                            taskData.due = {
                                timestamp: dueTs,
                                is_all_day: p.due.is_all_day ?? false,
                            };
                            log.info(`create: due time converted: ${p.due.timestamp} -> ${dueTs}ms`);
                        }
                        // Handle start time conversion
                        if (p.start?.timestamp) {
                            const startTs = (0, helpers_1.parseTimeToTimestampMs)(p.start.timestamp);
                            if (!startTs) {
                                return (0, helpers_1.json)({
                                    error: "start 时间格式错误！必须使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'。",
                                    received: p.start.timestamp,
                                });
                            }
                            taskData.start = {
                                timestamp: startTs,
                                is_all_day: p.start.is_all_day ?? false,
                            };
                        }
                        if (p.members)
                            taskData.members = p.members;
                        if (p.repeat_rule)
                            taskData.repeat_rule = p.repeat_rule;
                        if (p.tasklists)
                            taskData.tasklists = p.tasklists;
                        const res = await client.invoke('feishu_task_task.create', (sdk, opts) => sdk.task.v2.task.create({
                            data: taskData,
                            params: {
                                user_id_type: (p.user_id_type || 'open_id'),
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        const data = res.data;
                        log.info(`create: task created: task_guid=${data?.task?.guid}`);
                        return (0, helpers_1.json)({
                            task: res.data?.task,
                        });
                    }
                    // -----------------------------------------------------------------
                    // GET TASK
                    // -----------------------------------------------------------------
                    case 'get': {
                        log.info(`get: task_guid=${p.task_guid}`);
                        const res = await client.invoke('feishu_task_task.get', (sdk, opts) => sdk.task.v2.task.get({
                            path: { task_guid: p.task_guid },
                            params: {
                                user_id_type: (p.user_id_type || 'open_id'),
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`get: retrieved task ${p.task_guid}`);
                        return (0, helpers_1.json)({
                            task: res.data?.task,
                        });
                    }
                    // -----------------------------------------------------------------
                    // LIST TASKS
                    // -----------------------------------------------------------------
                    case 'list': {
                        log.info(`list: page_size=${p.page_size ?? 50}, completed=${p.completed ?? false}`);
                        const res = await client.invoke('feishu_task_task.list', (sdk, opts) => sdk.task.v2.task.list({
                            params: {
                                page_size: p.page_size,
                                page_token: p.page_token,
                                completed: p.completed,
                                user_id_type: (p.user_id_type || 'open_id'),
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        const data = res.data;
                        log.info(`list: returned ${data?.items?.length ?? 0} tasks`);
                        return (0, helpers_1.json)({
                            tasks: data?.items,
                            has_more: data?.has_more ?? false,
                            page_token: data?.page_token,
                        });
                    }
                    // -----------------------------------------------------------------
                    // PATCH TASK
                    // -----------------------------------------------------------------
                    case 'patch': {
                        log.info(`patch: task_guid=${p.task_guid}`);
                        const updateData = {};
                        if (p.summary)
                            updateData.summary = p.summary;
                        if (p.description !== undefined)
                            updateData.description = p.description;
                        // Handle due time conversion
                        if (p.due?.timestamp) {
                            const dueTs = (0, helpers_1.parseTimeToTimestampMs)(p.due.timestamp);
                            if (!dueTs) {
                                return (0, helpers_1.json)({
                                    error: "due 时间格式错误！必须使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'。",
                                    received: p.due.timestamp,
                                });
                            }
                            updateData.due = {
                                timestamp: dueTs,
                                is_all_day: p.due.is_all_day ?? false,
                            };
                        }
                        // Handle start time conversion
                        if (p.start?.timestamp) {
                            const startTs = (0, helpers_1.parseTimeToTimestampMs)(p.start.timestamp);
                            if (!startTs) {
                                return (0, helpers_1.json)({
                                    error: "start 时间格式错误！必须使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'。",
                                    received: p.start.timestamp,
                                });
                            }
                            updateData.start = {
                                timestamp: startTs,
                                is_all_day: p.start.is_all_day ?? false,
                            };
                        }
                        // Handle completed_at conversion
                        if (p.completed_at !== undefined) {
                            // 特殊值：反完成（设为未完成）
                            if (p.completed_at === '0') {
                                updateData.completed_at = '0';
                            }
                            // 数字字符串时间戳（直通）
                            else if (/^\d+$/.test(p.completed_at)) {
                                updateData.completed_at = p.completed_at;
                            }
                            // 时间格式字符串（需要转换）
                            else {
                                const completedTs = (0, helpers_1.parseTimeToTimestampMs)(p.completed_at);
                                if (!completedTs) {
                                    return (0, helpers_1.json)({
                                        error: "completed_at 格式错误！支持：1) ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'；2) '0'（反完成）；3) 毫秒时间戳字符串。",
                                        received: p.completed_at,
                                    });
                                }
                                updateData.completed_at = completedTs;
                            }
                        }
                        if (p.members)
                            updateData.members = p.members;
                        if (p.repeat_rule)
                            updateData.repeat_rule = p.repeat_rule;
                        // Build update_fields list (required by Task API)
                        const updateFields = Object.keys(updateData);
                        const res = await client.invoke('feishu_task_task.patch', (sdk, opts) => sdk.task.v2.task.patch({
                            path: { task_guid: p.task_guid },
                            data: {
                                task: updateData,
                                update_fields: updateFields,
                            },
                            params: {
                                user_id_type: (p.user_id_type || 'open_id'),
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`patch: task ${p.task_guid} updated`);
                        return (0, helpers_1.json)({
                            task: res.data?.task,
                        });
                    }
                }
            }
            catch (err) {
                return await (0, helpers_1.handleInvokeErrorWithAutoAuth)(err, cfg);
            }
        },
    }, { name: 'feishu_task_task' });
}
