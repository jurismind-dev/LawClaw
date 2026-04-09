"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_task_section tool -- Manage Feishu task sections.
 *
 * P0 Actions: create, get, list, patch, tasks
 *
 * Uses the Feishu Task v2 API:
 *   - create: POST /open-apis/task/v2/sections
 *   - get:    GET  /open-apis/task/v2/sections/:section_guid
 *   - patch:  PATCH /open-apis/task/v2/sections/:section_guid
 *   - list:   GET  /open-apis/task/v2/sections
 *   - tasks:  GET  /open-apis/task/v2/sections/:section_guid/tasks
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuTaskSectionTool = registerFeishuTaskSectionTool;
const typebox_1 = require("@sinclair/typebox");
const helpers_1 = require("../helpers.js");
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const FeishuTaskSectionSchema = typebox_1.Type.Union([
    // CREATE
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('create'),
        name: typebox_1.Type.String({
            description: '自定义分组名。不允许为空，最大100个utf8字符。',
        }),
        resource_type: (0, helpers_1.StringEnum)(['tasklist', 'my_tasks']),
        resource_id: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '自定义分组要归属的资源id。当resource_type为"tasklist"时这里需要填写清单的GUID；当resource_type为"my_tasks"时，无需填写。',
        })),
        insert_before: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '要将新分组插入到自定义分分组的前面的目标分组的guid。',
        })),
        insert_after: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '要将新分组插入到自定义分分组的后面的目标分组的guid。',
        })),
        user_id_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['open_id', 'union_id', 'user_id'])),
    }),
    // GET
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('get'),
        section_guid: typebox_1.Type.String({
            description: '要获取的自定义分组GUID',
        }),
        user_id_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['open_id', 'union_id', 'user_id'])),
    }),
    // PATCH
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('patch'),
        section_guid: typebox_1.Type.String({
            description: '要更新的自定义分组GUID',
        }),
        name: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '自定义字段名字',
        })),
        insert_before: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '要让当前自定义分组放到某个自定义分组前面的secion_guid，用于改变当前自定义分组的位置。',
        })),
        insert_after: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '要让当前自定义分组放到某个自定义分组后面的secion_guid，用于改变当前自定义分组的位置。',
        })),
        user_id_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['open_id', 'union_id', 'user_id'])),
    }),
    // LIST
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('list'),
        resource_type: (0, helpers_1.StringEnum)(['tasklist', 'my_tasks']),
        resource_id: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '如resource_type为"tasklist"，这里需要填写要列取自定义分组的清单的GUID。',
        })),
        page_size: typebox_1.Type.Optional(typebox_1.Type.Number({
            description: '分页大小',
        })),
        page_token: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '分页标记',
        })),
        user_id_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['open_id', 'union_id', 'user_id'])),
    }),
    // TASKS
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('tasks'),
        section_guid: typebox_1.Type.String({
            description: '要获取任务的自定义分组全局唯一ID',
        }),
        page_size: typebox_1.Type.Optional(typebox_1.Type.Number({
            description: '分页大小',
        })),
        page_token: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '分页标记',
        })),
        completed: typebox_1.Type.Optional(typebox_1.Type.Boolean({
            description: '按照任务状态过滤，如果不填写则表示不按完成状态过滤',
        })),
        created_from: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '按照创建时间筛选的起始时间（支持 ISO 8601 或毫秒时间戳）',
        })),
        created_to: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '按照创建时间筛选的结束时间（支持 ISO 8601 或毫秒时间戳）',
        })),
        user_id_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['open_id', 'union_id', 'user_id'])),
    }),
]);
// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
function registerFeishuTaskSectionTool(api) {
    if (!api.config)
        return;
    const cfg = api.config;
    const { toolClient, log } = (0, helpers_1.createToolContext)(api, 'feishu_task_section');
    (0, helpers_1.registerTool)(api, {
        name: 'feishu_task_section',
        label: 'Feishu Task Section Management',
        description: '【以用户身份】飞书任务自定义分组管理工具。用于创建、查询、更新自定义分组，以及列出分组内的任务。Actions: create（创建分组）, get（获取分组详情）, patch（更新分组）, list（获取分组列表）, tasks（获取分组任务列表）。',
        parameters: FeishuTaskSectionSchema,
        async execute(_toolCallId, params) {
            const p = params;
            try {
                const client = toolClient();
                switch (p.action) {
                    // -----------------------------------------------------------------
                    // CREATE SECTION
                    // -----------------------------------------------------------------
                    case 'create': {
                        log.info(`create: name=${p.name}, resource_type=${p.resource_type}`);
                        const data = {
                            name: p.name,
                            resource_type: p.resource_type,
                        };
                        if (p.resource_id)
                            data.resource_id = p.resource_id;
                        if (p.insert_before)
                            data.insert_before = p.insert_before;
                        if (p.insert_after)
                            data.insert_after = p.insert_after;
                        const res = await client.invoke('feishu_task_section.create', (sdk, opts) => sdk.task.v2.section.create({
                            data,
                            params: {
                                user_id_type: (p.user_id_type || 'open_id'),
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`create: section created: section_guid=${res.data?.section?.guid}`);
                        return (0, helpers_1.json)({
                            section: res.data?.section,
                        });
                    }
                    // -----------------------------------------------------------------
                    // GET SECTION
                    // -----------------------------------------------------------------
                    case 'get': {
                        log.info(`get: section_guid=${p.section_guid}`);
                        const res = await client.invoke('feishu_task_section.get', (sdk, opts) => sdk.task.v2.section.get({
                            path: { section_guid: p.section_guid },
                            params: {
                                user_id_type: (p.user_id_type || 'open_id'),
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`get: retrieved section ${p.section_guid}`);
                        return (0, helpers_1.json)({
                            section: res.data?.section,
                        });
                    }
                    // -----------------------------------------------------------------
                    // PATCH SECTION
                    // -----------------------------------------------------------------
                    case 'patch': {
                        log.info(`patch: section_guid=${p.section_guid}`);
                        const sectionData = {};
                        const updateFields = [];
                        if (p.name !== undefined) {
                            sectionData.name = p.name;
                            updateFields.push('name');
                        }
                        if (p.insert_before !== undefined) {
                            sectionData.insert_before = p.insert_before;
                            updateFields.push('insert_before');
                        }
                        if (p.insert_after !== undefined) {
                            sectionData.insert_after = p.insert_after;
                            updateFields.push('insert_after');
                        }
                        if (updateFields.length === 0) {
                            return (0, helpers_1.json)({
                                error: 'No fields to update',
                            });
                        }
                        const res = await client.invoke('feishu_task_section.patch', (sdk, opts) => sdk.task.v2.section.patch({
                            path: { section_guid: p.section_guid },
                            data: {
                                section: sectionData,
                                update_fields: updateFields,
                            },
                            params: {
                                user_id_type: (p.user_id_type || 'open_id'),
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`patch: section ${p.section_guid} updated`);
                        return (0, helpers_1.json)({
                            section: res.data?.section,
                        });
                    }
                    // -----------------------------------------------------------------
                    // LIST SECTIONS
                    // -----------------------------------------------------------------
                    case 'list': {
                        log.info(`list: resource_type=${p.resource_type}, page_size=${p.page_size ?? 50}`);
                        const paramsData = {
                            resource_type: p.resource_type,
                            user_id_type: (p.user_id_type || 'open_id'),
                        };
                        if (p.resource_id)
                            paramsData.resource_id = p.resource_id;
                        if (p.page_size !== undefined)
                            paramsData.page_size = p.page_size;
                        if (p.page_token !== undefined)
                            paramsData.page_token = p.page_token;
                        const res = await client.invoke('feishu_task_section.list', (sdk, opts) => sdk.task.v2.section.list({
                            params: paramsData,
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        const data = res.data;
                        log.info(`list: returned ${data?.items?.length ?? 0} sections`);
                        return (0, helpers_1.json)({
                            sections: data?.items,
                            has_more: data?.has_more ?? false,
                            page_token: data?.page_token,
                        });
                    }
                    // -----------------------------------------------------------------
                    // TASKS IN SECTION
                    // -----------------------------------------------------------------
                    case 'tasks': {
                        log.info(`tasks: section_guid=${p.section_guid}`);
                        const paramsData = {
                            user_id_type: (p.user_id_type || 'open_id'),
                        };
                        if (p.page_size !== undefined)
                            paramsData.page_size = p.page_size;
                        if (p.page_token !== undefined)
                            paramsData.page_token = p.page_token;
                        if (p.completed !== undefined)
                            paramsData.completed = p.completed;
                        if (p.created_from) {
                            const ts = (0, helpers_1.parseTimeToTimestampMs)(p.created_from);
                            if (ts)
                                paramsData.created_from = ts;
                            else
                                paramsData.created_from = p.created_from;
                        }
                        if (p.created_to) {
                            const ts = (0, helpers_1.parseTimeToTimestampMs)(p.created_to);
                            if (ts)
                                paramsData.created_to = ts;
                            else
                                paramsData.created_to = p.created_to;
                        }
                        const res = await client.invoke('feishu_task_section.tasks', (sdk, opts) => sdk.task.v2.section.tasks({
                            path: { section_guid: p.section_guid },
                            params: paramsData,
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
                }
            }
            catch (err) {
                return await (0, helpers_1.handleInvokeErrorWithAutoAuth)(err, cfg);
            }
        },
    }, { name: 'feishu_task_section' });
}
