"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_bitable_app_table tool -- Manage Feishu Bitable tables.
 *
 * P0 Actions: create, list, patch
 * P1 Actions: batch_create
 *
 * Uses the Feishu Bitable v1 API:
 *   - create: POST /open-apis/bitable/v1/apps/:app_token/tables
 *   - list:   GET  /open-apis/bitable/v1/apps/:app_token/tables
 *   - patch:  PATCH /open-apis/bitable/v1/apps/:app_token/tables/:table_id
 *   - batch_create: POST /open-apis/bitable/v1/apps/:app_token/tables/batch_create
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuBitableAppTableTool = registerFeishuBitableAppTableTool;
const typebox_1 = require("@sinclair/typebox");
const helpers_1 = require("../helpers.js");
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const FeishuBitableAppTableSchema = typebox_1.Type.Union([
    // CREATE (P0)
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('create'),
        app_token: typebox_1.Type.String({ description: '多维表格 token' }),
        table: typebox_1.Type.Object({
            name: typebox_1.Type.String({ description: '数据表名称' }),
            default_view_name: typebox_1.Type.Optional(typebox_1.Type.String({ description: '默认视图名称' })),
            fields: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.Object({
                field_name: typebox_1.Type.String({ description: '字段名称' }),
                type: typebox_1.Type.Number({
                    description: '字段类型（1=文本，2=数字，3=单选，4=多选，5=日期，7=复选框，11=人员，13=电话，15=超链接，17=附件，1001=创建时间，1002=修改时间等）',
                }),
                property: typebox_1.Type.Optional(typebox_1.Type.Any({ description: '字段属性配置（根据类型而定）' })),
            }), { description: '字段列表（可选，但强烈建议在创建表时就传入所有字段，避免后续逐个添加）。不传则创建空表。' })),
        }),
    }),
    // LIST (P0)
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('list'),
        app_token: typebox_1.Type.String({ description: '多维表格 token' }),
        page_size: typebox_1.Type.Optional(typebox_1.Type.Number({ description: '每页数量，默认 50，最大 100' })),
        page_token: typebox_1.Type.Optional(typebox_1.Type.String({ description: '分页标记' })),
    }),
    // PATCH (P0)
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('patch'),
        app_token: typebox_1.Type.String({ description: '多维表格 token' }),
        table_id: typebox_1.Type.String({ description: '数据表 ID' }),
        name: typebox_1.Type.Optional(typebox_1.Type.String({ description: '新的表名' })),
    }),
    // BATCH_CREATE (P1)
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('batch_create'),
        app_token: typebox_1.Type.String({ description: '多维表格 token' }),
        tables: typebox_1.Type.Array(typebox_1.Type.Object({
            name: typebox_1.Type.String({ description: '数据表名称' }),
        }), { description: '要批量创建的数据表列表' }),
    }),
]);
// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
function registerFeishuBitableAppTableTool(api) {
    if (!api.config)
        return;
    const cfg = api.config;
    const { toolClient, log } = (0, helpers_1.createToolContext)(api, 'feishu_bitable_app_table');
    (0, helpers_1.registerTool)(api, {
        name: 'feishu_bitable_app_table',
        label: 'Feishu Bitable Tables',
        description: '【以用户身份】飞书多维表格数据表管理工具。当用户要求创建/查询/管理数据表时使用。' +
            '\n\nActions: create（创建数据表，可选择在创建时传入 fields 数组定义字段，或后续逐个添加）, list（列出所有数据表）, patch（更新数据表）, batch_create（批量创建）。' +
            '\n\n【字段定义方式】支持两种模式：1) 明确需求时，在 create 中通过 table.fields 一次性定义所有字段（减少 API 调用）；2) 探索式场景时，使用默认表 + feishu_bitable_app_table_field 逐步修改字段（更稳定，易调整）。',
        parameters: FeishuBitableAppTableSchema,
        async execute(_toolCallId, params) {
            const p = params;
            try {
                const client = toolClient();
                switch (p.action) {
                    // -----------------------------------------------------------------
                    // CREATE
                    // -----------------------------------------------------------------
                    case 'create': {
                        log.info(`create: app_token=${p.app_token}, table_name=${p.table.name}, fields_count=${p.table.fields?.length ?? 0}`);
                        // 特殊处理：复选框（type=7）和超链接（type=15）字段不能传 property
                        const tableData = { ...p.table };
                        if (tableData.fields) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            tableData.fields = tableData.fields.map((field) => {
                                if ((field.type === 7 || field.type === 15) && field.property !== undefined) {
                                    const fieldTypeName = field.type === 15 ? 'URL' : 'Checkbox';
                                    log.warn(`create: ${fieldTypeName} field (type=${field.type}, name="${field.field_name}") detected with property parameter. ` +
                                        `Removing property to avoid API error. ` +
                                        `${fieldTypeName} fields must omit the property parameter entirely.`);
                                    const { property: _property, ...fieldWithoutProperty } = field;
                                    return fieldWithoutProperty;
                                }
                                return field;
                            });
                        }
                        const res = await client.invoke('feishu_bitable_app_table.create', (sdk, opts) => sdk.bitable.appTable.create({
                            path: {
                                app_token: p.app_token,
                            },
                            data: {
                                table: tableData,
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`create: created table ${res.data?.table_id}`);
                        return (0, helpers_1.json)({
                            table_id: res.data?.table_id,
                            default_view_id: res.data?.default_view_id,
                            field_id_list: res.data?.field_id_list,
                        });
                    }
                    // -----------------------------------------------------------------
                    // LIST
                    // -----------------------------------------------------------------
                    case 'list': {
                        log.info(`list: app_token=${p.app_token}, page_size=${p.page_size ?? 50}`);
                        const res = await client.invoke('feishu_bitable_app_table.list', (sdk, opts) => sdk.bitable.appTable.list({
                            path: {
                                app_token: p.app_token,
                            },
                            params: {
                                page_size: p.page_size,
                                page_token: p.page_token,
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        const data = res.data;
                        log.info(`list: returned ${data?.items?.length ?? 0} tables`);
                        return (0, helpers_1.json)({
                            tables: data?.items,
                            has_more: data?.has_more ?? false,
                            page_token: data?.page_token,
                        });
                    }
                    // -----------------------------------------------------------------
                    // PATCH
                    // -----------------------------------------------------------------
                    case 'patch': {
                        log.info(`patch: app_token=${p.app_token}, table_id=${p.table_id}, name=${p.name}`);
                        const res = await client.invoke('feishu_bitable_app_table.patch', (sdk, opts) => sdk.bitable.appTable.patch({
                            path: {
                                app_token: p.app_token,
                                table_id: p.table_id,
                            },
                            data: {
                                name: p.name,
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`patch: updated table ${p.table_id}`);
                        return (0, helpers_1.json)({
                            name: res.data?.name,
                        });
                    }
                    // -----------------------------------------------------------------
                    // BATCH_CREATE (P1)
                    // -----------------------------------------------------------------
                    case 'batch_create': {
                        if (!p.tables || p.tables.length === 0) {
                            return (0, helpers_1.json)({
                                error: 'tables is required and cannot be empty',
                            });
                        }
                        log.info(`batch_create: app_token=${p.app_token}, tables_count=${p.tables.length}`);
                        const res = await client.invoke('feishu_bitable_app_table.batch_create', (sdk, opts) => sdk.bitable.appTable.batchCreate({
                            path: {
                                app_token: p.app_token,
                            },
                            data: {
                                tables: p.tables,
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`batch_create: created ${p.tables.length} tables in app ${p.app_token}`);
                        return (0, helpers_1.json)({
                            table_ids: res.data?.table_ids,
                        });
                    }
                }
            }
            catch (err) {
                return await (0, helpers_1.handleInvokeErrorWithAutoAuth)(err, cfg);
            }
        },
    }, { name: 'feishu_bitable_app_table' });
}
