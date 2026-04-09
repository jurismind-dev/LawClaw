"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_bitable_app_table_view tool -- Manage Feishu Bitable views.
 *
 * P1 Actions: create, get, list, patch
 *
 * Uses the Feishu Bitable v1 API:
 *   - create: POST /open-apis/bitable/v1/apps/:app_token/tables/:table_id/views
 *   - get:    GET  /open-apis/bitable/v1/apps/:app_token/tables/:table_id/views/:view_id
 *   - list:   GET  /open-apis/bitable/v1/apps/:app_token/tables/:table_id/views
 *   - patch:  PATCH /open-apis/bitable/v1/apps/:app_token/tables/:table_id/views/:view_id
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuBitableAppTableViewTool = registerFeishuBitableAppTableViewTool;
const typebox_1 = require("@sinclair/typebox");
const helpers_1 = require("../helpers.js");
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const FeishuBitableAppTableViewSchema = typebox_1.Type.Union([
    // CREATE (P1)
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('create'),
        app_token: typebox_1.Type.String({ description: '多维表格 token' }),
        table_id: typebox_1.Type.String({ description: '数据表 ID' }),
        view_name: typebox_1.Type.String({ description: '视图名称' }),
        view_type: typebox_1.Type.Optional(typebox_1.Type.Union([
            typebox_1.Type.Literal('grid'), // 表格视图
            typebox_1.Type.Literal('kanban'), // 看板视图
            typebox_1.Type.Literal('gallery'), // 画册视图
            typebox_1.Type.Literal('gantt'), // 甘特图
            typebox_1.Type.Literal('form'), // 表单视图
        ])),
    }),
    // GET (P1)
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('get'),
        app_token: typebox_1.Type.String({ description: '多维表格 token' }),
        table_id: typebox_1.Type.String({ description: '数据表 ID' }),
        view_id: typebox_1.Type.String({ description: '视图 ID' }),
    }),
    // LIST (P1)
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('list'),
        app_token: typebox_1.Type.String({ description: '多维表格 token' }),
        table_id: typebox_1.Type.String({ description: '数据表 ID' }),
        page_size: typebox_1.Type.Optional(typebox_1.Type.Number({ description: '每页数量，默认 50，最大 100' })),
        page_token: typebox_1.Type.Optional(typebox_1.Type.String({ description: '分页标记' })),
    }),
    // PATCH (P1)
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('patch'),
        app_token: typebox_1.Type.String({ description: '多维表格 token' }),
        table_id: typebox_1.Type.String({ description: '数据表 ID' }),
        view_id: typebox_1.Type.String({ description: '视图 ID' }),
        view_name: typebox_1.Type.Optional(typebox_1.Type.String({ description: '新的视图名称' })),
    }),
]);
// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
function registerFeishuBitableAppTableViewTool(api) {
    if (!api.config)
        return;
    const cfg = api.config;
    const { toolClient, log } = (0, helpers_1.createToolContext)(api, 'feishu_bitable_app_table_view');
    (0, helpers_1.registerTool)(api, {
        name: 'feishu_bitable_app_table_view',
        label: 'Feishu Bitable Views',
        description: '【以用户身份】飞书多维表格视图管理工具。当用户要求创建/查询/更新视图、切换展示方式时使用。Actions: create（创建视图）, get（获取视图详情）, list（列出所有视图）, patch（更新视图）。',
        parameters: FeishuBitableAppTableViewSchema,
        async execute(_toolCallId, params) {
            const p = params;
            try {
                const client = toolClient();
                switch (p.action) {
                    // -----------------------------------------------------------------
                    // CREATE
                    // -----------------------------------------------------------------
                    case 'create': {
                        log.info(`create: app_token=${p.app_token}, table_id=${p.table_id}, view_name=${p.view_name}, view_type=${p.view_type ?? 'grid'}`);
                        const res = await client.invoke('feishu_bitable_app_table_view.create', (sdk, opts) => sdk.bitable.appTableView.create({
                            path: {
                                app_token: p.app_token,
                                table_id: p.table_id,
                            },
                            data: {
                                view_name: p.view_name,
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                view_type: (p.view_type || 'grid'),
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`create: created view ${res.data?.view?.view_id}`);
                        return (0, helpers_1.json)({
                            view: res.data?.view,
                        });
                    }
                    // -----------------------------------------------------------------
                    // GET
                    // -----------------------------------------------------------------
                    case 'get': {
                        log.info(`get: app_token=${p.app_token}, table_id=${p.table_id}, view_id=${p.view_id}`);
                        const res = await client.invoke('feishu_bitable_app_table_view.get', (sdk, opts) => sdk.bitable.appTableView.get({
                            path: {
                                app_token: p.app_token,
                                table_id: p.table_id,
                                view_id: p.view_id,
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`get: returned view ${p.view_id}`);
                        return (0, helpers_1.json)({
                            view: res.data?.view,
                        });
                    }
                    // -----------------------------------------------------------------
                    // LIST
                    // -----------------------------------------------------------------
                    case 'list': {
                        log.info(`list: app_token=${p.app_token}, table_id=${p.table_id}`);
                        const res = await client.invoke('feishu_bitable_app_table_view.list', (sdk, opts) => sdk.bitable.appTableView.list({
                            path: {
                                app_token: p.app_token,
                                table_id: p.table_id,
                            },
                            params: {
                                page_size: p.page_size,
                                page_token: p.page_token,
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        const data = res.data;
                        log.info(`list: returned ${data?.items?.length ?? 0} views`);
                        return (0, helpers_1.json)({
                            views: data?.items,
                            has_more: data?.has_more ?? false,
                            page_token: data?.page_token,
                        });
                    }
                    // -----------------------------------------------------------------
                    // PATCH
                    // -----------------------------------------------------------------
                    case 'patch': {
                        log.info(`patch: app_token=${p.app_token}, table_id=${p.table_id}, view_id=${p.view_id}, view_name=${p.view_name}`);
                        const res = await client.invoke('feishu_bitable_app_table_view.patch', (sdk, opts) => sdk.bitable.appTableView.patch({
                            path: {
                                app_token: p.app_token,
                                table_id: p.table_id,
                                view_id: p.view_id,
                            },
                            data: {
                                view_name: p.view_name,
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`patch: updated view ${p.view_id}`);
                        return (0, helpers_1.json)({
                            view: res.data?.view,
                        });
                    }
                }
            }
            catch (err) {
                return await (0, helpers_1.handleInvokeErrorWithAutoAuth)(err, cfg);
            }
        },
    }, { name: 'feishu_bitable_app_table_view' });
}
