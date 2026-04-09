"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_task_tasklist tool -- Manage Feishu task lists.
 *
 * P0 Actions: create, get, list, tasks
 * P1 Actions: patch, add_members
 *
 * Uses the Feishu Task v2 API:
 *   - create: POST /open-apis/task/v2/tasklists
 *   - get:    GET  /open-apis/task/v2/tasklists/:tasklist_guid
 *   - list:   GET  /open-apis/task/v2/tasklists
 *   - tasks:  GET  /open-apis/task/v2/tasklists/:tasklist_guid/tasks
 *   - patch:  PATCH /open-apis/task/v2/tasklists/:tasklist_guid
 *   - add_members: POST /open-apis/task/v2/tasklists/:tasklist_guid/add_members
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuTaskTasklistTool = registerFeishuTaskTasklistTool;
const typebox_1 = require("@sinclair/typebox");
const helpers_1 = require("../helpers.js");
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const FeishuTaskTasklistSchema = typebox_1.Type.Union([
    // CREATE (P0)
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('create'),
        name: typebox_1.Type.String({
            description: '清单名称',
        }),
        members: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.Object({
            id: typebox_1.Type.String({ description: '成员 open_id' }),
            role: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['editor', 'viewer'])),
        }), {
            description: '清单成员列表（editor=可编辑，viewer=可查看）。注意：创建人自动成为 owner，如在 members 中也指定创建人，该用户最终成为 owner 并从 members 中移除（同一用户只能有一个角色）',
        })),
    }),
    // GET (P0)
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('get'),
        tasklist_guid: typebox_1.Type.String({ description: '清单 GUID' }),
    }),
    // LIST (P0)
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('list'),
        page_size: typebox_1.Type.Optional(typebox_1.Type.Number({ description: '每页数量，默认 50，最大 100' })),
        page_token: typebox_1.Type.Optional(typebox_1.Type.String({ description: '分页标记' })),
    }),
    // TASKS (P0) - 列出清单内的任务
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('tasks'),
        tasklist_guid: typebox_1.Type.String({ description: '清单 GUID' }),
        page_size: typebox_1.Type.Optional(typebox_1.Type.Number({ description: '每页数量，默认 50，最大 100' })),
        page_token: typebox_1.Type.Optional(typebox_1.Type.String({ description: '分页标记' })),
        completed: typebox_1.Type.Optional(typebox_1.Type.Boolean({ description: '是否只返回已完成的任务（默认返回所有）' })),
    }),
    // PATCH (P1)
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('patch'),
        tasklist_guid: typebox_1.Type.String({ description: '清单 GUID' }),
        name: typebox_1.Type.Optional(typebox_1.Type.String({ description: '新的清单名称' })),
    }),
    // ADD_MEMBERS (P1)
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('add_members'),
        tasklist_guid: typebox_1.Type.String({ description: '清单 GUID' }),
        members: typebox_1.Type.Array(typebox_1.Type.Object({
            id: typebox_1.Type.String({ description: '成员 open_id' }),
            role: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['editor', 'viewer'])),
        }), { description: '要添加的成员列表' }),
    }),
]);
// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
function registerFeishuTaskTasklistTool(api) {
    if (!api.config)
        return;
    const cfg = api.config;
    const { toolClient, log } = (0, helpers_1.createToolContext)(api, 'feishu_task_tasklist');
    (0, helpers_1.registerTool)(api, {
        name: 'feishu_task_tasklist',
        label: 'Feishu Task Lists',
        description: '【以用户身份】飞书任务清单管理工具。当用户要求创建/查询/管理清单、查看清单内的任务时使用。Actions: create（创建清单）, get（获取清单详情）, list（列出所有可读取的清单，包括我创建的和他人共享给我的）, tasks（列出清单内的任务）, patch（更新清单）, add_members（添加成员）。',
        parameters: FeishuTaskTasklistSchema,
        async execute(_toolCallId, params) {
            const p = params;
            try {
                const client = toolClient();
                switch (p.action) {
                    // -----------------------------------------------------------------
                    // CREATE
                    // -----------------------------------------------------------------
                    case 'create': {
                        log.info(`create: name=${p.name}, members_count=${p.members?.length ?? 0}`);
                        const data = { name: p.name };
                        // 转换成员格式
                        if (p.members && p.members.length > 0) {
                            data.members = p.members.map((m) => ({
                                id: m.id,
                                type: 'user',
                                role: m.role || 'editor',
                            }));
                        }
                        const res = await client.invoke('feishu_task_tasklist.create', (sdk, opts) => sdk.task.v2.tasklist.create({
                            params: {
                                user_id_type: 'open_id',
                            },
                            data,
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`create: created tasklist ${res.data?.tasklist?.guid}`);
                        return (0, helpers_1.json)({
                            tasklist: res.data?.tasklist,
                        });
                    }
                    // -----------------------------------------------------------------
                    // GET
                    // -----------------------------------------------------------------
                    case 'get': {
                        log.info(`get: tasklist_guid=${p.tasklist_guid}`);
                        const res = await client.invoke('feishu_task_tasklist.get', (sdk, opts) => sdk.task.v2.tasklist.get({
                            path: {
                                tasklist_guid: p.tasklist_guid,
                            },
                            params: {
                                user_id_type: 'open_id',
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`get: returned tasklist ${p.tasklist_guid}`);
                        return (0, helpers_1.json)({
                            tasklist: res.data?.tasklist,
                        });
                    }
                    // -----------------------------------------------------------------
                    // LIST
                    // -----------------------------------------------------------------
                    case 'list': {
                        log.info(`list: page_size=${p.page_size ?? 50}`);
                        const res = await client.invoke('feishu_task_tasklist.list', (sdk, opts) => sdk.task.v2.tasklist.list({
                            params: {
                                page_size: p.page_size,
                                page_token: p.page_token,
                                user_id_type: 'open_id',
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        const data = res.data;
                        log.info(`list: returned ${data?.items?.length ?? 0} tasklists`);
                        return (0, helpers_1.json)({
                            tasklists: data?.items,
                            has_more: data?.has_more ?? false,
                            page_token: data?.page_token,
                        });
                    }
                    // -----------------------------------------------------------------
                    // TASKS - 列出清单内的任务
                    // -----------------------------------------------------------------
                    case 'tasks': {
                        log.info(`tasks: tasklist_guid=${p.tasklist_guid}, completed=${p.completed ?? 'all'}`);
                        const res = await client.invoke('feishu_task_tasklist.tasks', (sdk, opts) => sdk.task.v2.tasklist.tasks({
                            path: {
                                tasklist_guid: p.tasklist_guid,
                            },
                            params: {
                                page_size: p.page_size,
                                page_token: p.page_token,
                                completed: p.completed,
                                user_id_type: 'open_id',
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        const data = res.data;
                        log.info(`tasks: returned ${data?.items?.length ?? 0} tasks`);
                        return (0, helpers_1.json)({
                            tasks: data?.items,
                            has_more: data?.has_more ?? false,
                            page_token: data?.page_token,
                        });
                    }
                    // -----------------------------------------------------------------
                    // PATCH
                    // -----------------------------------------------------------------
                    case 'patch': {
                        log.info(`patch: tasklist_guid=${p.tasklist_guid}, name=${p.name}`);
                        // 飞书 Task API 要求特殊的更新格式
                        const tasklistData = {};
                        const updateFields = [];
                        if (p.name !== undefined) {
                            tasklistData.name = p.name;
                            updateFields.push('name');
                        }
                        if (updateFields.length === 0) {
                            return (0, helpers_1.json)({
                                error: 'No fields to update',
                            });
                        }
                        const res = await client.invoke('feishu_task_tasklist.patch', (sdk, opts) => sdk.task.v2.tasklist.patch({
                            path: {
                                tasklist_guid: p.tasklist_guid,
                            },
                            params: {
                                user_id_type: 'open_id',
                            },
                            data: {
                                tasklist: tasklistData,
                                update_fields: updateFields,
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`patch: updated tasklist ${p.tasklist_guid}`);
                        return (0, helpers_1.json)({
                            tasklist: res.data?.tasklist,
                        });
                    }
                    // -----------------------------------------------------------------
                    // ADD_MEMBERS
                    // -----------------------------------------------------------------
                    case 'add_members': {
                        if (!p.members || p.members.length === 0) {
                            return (0, helpers_1.json)({
                                error: 'members is required and cannot be empty',
                            });
                        }
                        log.info(`add_members: tasklist_guid=${p.tasklist_guid}, members_count=${p.members.length}`);
                        const memberData = p.members.map((m) => ({
                            id: m.id,
                            type: 'user',
                            role: m.role || 'editor',
                        }));
                        const res = await client.invoke('feishu_task_tasklist.add_members', (sdk, opts) => sdk.task.v2.tasklist.addMembers({
                            path: {
                                tasklist_guid: p.tasklist_guid,
                            },
                            params: {
                                user_id_type: 'open_id',
                            },
                            data: {
                                members: memberData,
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`add_members: added ${p.members.length} members to tasklist ${p.tasklist_guid}`);
                        return (0, helpers_1.json)({
                            tasklist: res.data?.tasklist,
                        });
                    }
                }
            }
            catch (err) {
                return await (0, helpers_1.handleInvokeErrorWithAutoAuth)(err, cfg);
            }
        },
    }, { name: 'feishu_task_tasklist' });
}
