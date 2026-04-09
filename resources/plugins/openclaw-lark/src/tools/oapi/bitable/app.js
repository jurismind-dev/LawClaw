"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_bitable_app tool -- Manage Feishu Bitable apps (multidimensional tables).
 *
 * P0 Actions: create, get, list, patch
 * P1 Actions: copy
 *
 * Uses the Feishu Bitable v1 API:
 *   - create: POST /open-apis/bitable/v1/apps
 *   - get:    GET  /open-apis/bitable/v1/apps/:app_token
 *   - list:   GET  /open-apis/drive/v1/files (filtered by type=bitable)
 *   - patch:  PATCH /open-apis/bitable/v1/apps/:app_token
 *   - copy:   POST /open-apis/bitable/v1/apps/:app_token/copy
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuBitableAppTool = registerFeishuBitableAppTool;
const typebox_1 = require("@sinclair/typebox");
const helpers_1 = require("../helpers.js");
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const FeishuBitableAppSchema = typebox_1.Type.Union([
    // CREATE (P0)
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('create'),
        name: typebox_1.Type.String({ description: '多维表格名称' }),
        folder_token: typebox_1.Type.Optional(typebox_1.Type.String({ description: '所在文件夹 token（默认创建在我的空间）' })),
    }),
    // GET (P0)
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('get'),
        app_token: typebox_1.Type.String({ description: '多维表格的唯一标识 token' }),
    }),
    // LIST (P0) - 通过 Drive API 获取
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('list'),
        folder_token: typebox_1.Type.Optional(typebox_1.Type.String({ description: '文件夹 token（默认列出我的空间）' })),
        page_size: typebox_1.Type.Optional(typebox_1.Type.Number({ description: '每页数量，默认 50，最大 200' })),
        page_token: typebox_1.Type.Optional(typebox_1.Type.String({ description: '分页标记' })),
    }),
    // PATCH (P0)
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('patch'),
        app_token: typebox_1.Type.String({ description: '多维表格 token' }),
        name: typebox_1.Type.Optional(typebox_1.Type.String({ description: '新的名称' })),
        is_advanced: typebox_1.Type.Optional(typebox_1.Type.Boolean({ description: '是否开启高级权限' })),
    }),
    // COPY (P1)
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('copy'),
        app_token: typebox_1.Type.String({ description: '源多维表格 token' }),
        name: typebox_1.Type.String({ description: '新的名称' }),
        folder_token: typebox_1.Type.Optional(typebox_1.Type.String({ description: '目标文件夹 token' })),
    }),
]);
// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
function registerFeishuBitableAppTool(api) {
    if (!api.config)
        return;
    const cfg = api.config;
    const { toolClient, log } = (0, helpers_1.createToolContext)(api, 'feishu_bitable_app');
    (0, helpers_1.registerTool)(api, {
        name: 'feishu_bitable_app',
        label: 'Feishu Bitable Apps',
        description: '【以用户身份】飞书多维表格应用管理工具。当用户要求创建/查询/管理多维表格时使用。Actions: create（创建多维表格）, get（获取多维表格元数据）, list（列出多维表格）, patch（更新元数据）, delete（删除多维表格）, copy（复制多维表格）。',
        parameters: FeishuBitableAppSchema,
        async execute(_toolCallId, params) {
            const p = params;
            try {
                const client = toolClient();
                switch (p.action) {
                    // -----------------------------------------------------------------
                    // CREATE
                    // -----------------------------------------------------------------
                    case 'create': {
                        log.info(`create: name=${p.name}, folder_token=${p.folder_token ?? 'my_space'}`);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const data = { name: p.name };
                        if (p.folder_token) {
                            data.folder_token = p.folder_token;
                        }
                        const res = await client.invoke('feishu_bitable_app.create', (sdk, opts) => sdk.bitable.app.create({
                            data,
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`create: created app ${res.data?.app?.app_token}`);
                        return (0, helpers_1.json)({
                            app: res.data?.app,
                        });
                    }
                    // -----------------------------------------------------------------
                    // GET
                    // -----------------------------------------------------------------
                    case 'get': {
                        log.info(`get: app_token=${p.app_token}`);
                        const res = await client.invoke('feishu_bitable_app.get', (sdk, opts) => sdk.bitable.app.get({
                            path: {
                                app_token: p.app_token,
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`get: returned app ${p.app_token}`);
                        return (0, helpers_1.json)({
                            app: res.data?.app,
                        });
                    }
                    // -----------------------------------------------------------------
                    // LIST - 使用 Drive API 筛选 bitable 类型文件
                    // -----------------------------------------------------------------
                    case 'list': {
                        log.info(`list: folder_token=${p.folder_token ?? 'my_space'}, page_size=${p.page_size ?? 50}`);
                        const res = await client.invoke('feishu_bitable_app.list', (sdk, opts) => sdk.drive.v1.file.list({
                            params: {
                                folder_token: p.folder_token || '',
                                page_size: p.page_size,
                                page_token: p.page_token,
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        // 筛选出 type === "bitable" 的文件
                        const data = res.data;
                        const bitables = data?.files?.filter(
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (f) => f.type === 'bitable') || [];
                        log.info(`list: returned ${bitables.length} bitable apps`);
                        return (0, helpers_1.json)({
                            apps: bitables,
                            has_more: data?.has_more ?? false,
                            page_token: data?.page_token,
                        });
                    }
                    // -----------------------------------------------------------------
                    // PATCH
                    // -----------------------------------------------------------------
                    case 'patch': {
                        log.info(`patch: app_token=${p.app_token}, name=${p.name}, is_advanced=${p.is_advanced}`);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const updateData = {};
                        if (p.name !== undefined)
                            updateData.name = p.name;
                        if (p.is_advanced !== undefined)
                            updateData.is_advanced = p.is_advanced;
                        const res = await client.invoke('feishu_bitable_app.patch', (sdk, opts) => sdk.bitable.app.update({
                            path: {
                                app_token: p.app_token,
                            },
                            data: updateData,
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`patch: updated app ${p.app_token}`);
                        return (0, helpers_1.json)({
                            app: res.data?.app,
                        });
                    }
                    // -----------------------------------------------------------------
                    // COPY (P1)
                    // -----------------------------------------------------------------
                    case 'copy': {
                        log.info(`copy: app_token=${p.app_token}, name=${p.name}, folder_token=${p.folder_token ?? 'my_space'}`);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const data = { name: p.name };
                        if (p.folder_token) {
                            data.folder_token = p.folder_token;
                        }
                        const res = await client.invoke('feishu_bitable_app.copy', (sdk, opts) => sdk.bitable.app.copy({
                            path: {
                                app_token: p.app_token,
                            },
                            data,
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`copy: created copy ${res.data?.app?.app_token}`);
                        return (0, helpers_1.json)({
                            app: res.data?.app,
                        });
                    }
                }
            }
            catch (err) {
                return await (0, helpers_1.handleInvokeErrorWithAutoAuth)(err, cfg);
            }
        },
    }, { name: 'feishu_bitable_app' });
}
