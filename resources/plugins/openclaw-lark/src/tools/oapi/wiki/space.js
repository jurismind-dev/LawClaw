"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_wiki_space tool -- Manage Feishu Wiki spaces.
 *
 * Actions: list, get, create
 *
 * Uses the Feishu Wiki API:
 *   - list:   GET  /open-apis/wiki/v2/spaces
 *   - get:    GET  /open-apis/wiki/v2/spaces/:space_id
 *   - create: POST /open-apis/wiki/v2/spaces
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuWikiSpaceTool = registerFeishuWikiSpaceTool;
const typebox_1 = require("@sinclair/typebox");
const helpers_1 = require("../helpers.js");
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const FeishuWikiSpaceSchema = typebox_1.Type.Union([
    // LIST SPACES
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('list'),
        page_size: typebox_1.Type.Optional(typebox_1.Type.Integer({
            description: '分页大小（默认 10，最大 50）',
            minimum: 1,
            maximum: 50,
        })),
        page_token: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '分页标记。首次请求无需填写',
        })),
    }),
    // GET SPACE
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('get'),
        space_id: typebox_1.Type.String({
            description: '知识空间 ID（必填）',
        }),
    }),
    // CREATE SPACE
    typebox_1.Type.Object({
        action: typebox_1.Type.Literal('create'),
        name: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '知识空间名称',
        })),
        description: typebox_1.Type.Optional(typebox_1.Type.String({
            description: '知识空间描述',
        })),
    }),
]);
// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
function registerFeishuWikiSpaceTool(api) {
    if (!api.config)
        return false;
    const cfg = api.config;
    const { toolClient, log } = (0, helpers_1.createToolContext)(api, 'feishu_wiki_space');
    return (0, helpers_1.registerTool)(api, {
        name: 'feishu_wiki_space',
        label: 'Feishu Wiki Spaces',
        description: '飞书知识空间管理工具。当用户要求查看知识库列表、获取知识库信息、创建知识库时使用。Actions: list（列出知识空间）, get（获取知识空间信息）, create（创建知识空间）。' +
            '【重要】space_id 可以从浏览器 URL 中获取，或通过 list 接口获取。' +
            '【重要】知识空间（Space）是知识库的基本组成单位，包含多个具有层级关系的文档节点。',
        parameters: FeishuWikiSpaceSchema,
        async execute(_toolCallId, params) {
            const p = params;
            try {
                const client = toolClient();
                switch (p.action) {
                    // -----------------------------------------------------------------
                    // LIST SPACES
                    // -----------------------------------------------------------------
                    case 'list': {
                        log.info(`list: page_size=${p.page_size ?? 10}`);
                        const res = await client.invoke('feishu_wiki_space.list', (sdk, opts) => sdk.wiki.space.list({
                            params: {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                page_size: p.page_size,
                                page_token: p.page_token,
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        const data = res.data;
                        log.info(`list: returned ${data?.items?.length ?? 0} spaces`);
                        return (0, helpers_1.json)({
                            spaces: data?.items,
                            has_more: data?.has_more,
                            page_token: data?.page_token,
                        });
                    }
                    // -----------------------------------------------------------------
                    // GET SPACE
                    // -----------------------------------------------------------------
                    case 'get': {
                        log.info(`get: space_id=${p.space_id}`);
                        const res = await client.invoke('feishu_wiki_space.get', (sdk, opts) => sdk.wiki.space.get({
                            path: { space_id: p.space_id },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        log.info(`get: retrieved space ${p.space_id}`);
                        return (0, helpers_1.json)({
                            space: res.data?.space,
                        });
                    }
                    // -----------------------------------------------------------------
                    // CREATE SPACE
                    // -----------------------------------------------------------------
                    case 'create': {
                        log.info(`create: name=${p.name ?? '(empty)'}, description=${p.description ?? '(empty)'}`);
                        const res = await client.invoke('feishu_wiki_space.create', (sdk, opts) => sdk.wiki.space.create({
                            data: {
                                name: p.name,
                                description: p.description,
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(res);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        log.info(`create: created space_id=${res.data?.space?.space_id}`);
                        return (0, helpers_1.json)({
                            space: res.data?.space,
                        });
                    }
                }
            }
            catch (err) {
                return await (0, helpers_1.handleInvokeErrorWithAutoAuth)(err, cfg);
            }
        },
    }, { name: 'feishu_wiki_space' });
}
