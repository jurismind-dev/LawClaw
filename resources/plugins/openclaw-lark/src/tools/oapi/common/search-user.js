"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_search_user tool -- 搜索员工
 *
 * 通过关键词搜索员工，结果按亲密度排序
 * 使用搜索接口（/open-apis/search/v1/user）
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSearchUserTool = registerSearchUserTool;
const typebox_1 = require("@sinclair/typebox");
const helpers_1 = require("../helpers.js");
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const SearchUserSchema = typebox_1.Type.Object({
    query: typebox_1.Type.String({
        description: '搜索关键词，用于匹配用户名（必填）',
    }),
    page_size: typebox_1.Type.Optional(typebox_1.Type.Integer({
        description: '分页大小，控制每次返回的用户数量（默认20，最大200）',
        minimum: 1,
        maximum: 200,
    })),
    page_token: typebox_1.Type.Optional(typebox_1.Type.String({
        description: '分页标识。首次请求无需填写；当返回结果中包含 page_token 时，可传入该值继续请求下一页',
    })),
});
// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
function registerSearchUserTool(api) {
    if (!api.config)
        return;
    const cfg = api.config;
    const { toolClient, log } = (0, helpers_1.createToolContext)(api, 'feishu_search_user');
    (0, helpers_1.registerTool)(api, {
        name: 'feishu_search_user',
        label: 'Feishu: Search User',
        description: '搜索员工信息（通过关键词搜索姓名、手机号、邮箱）。' + '返回匹配的员工列表，包含姓名、部门、open_id 等信息。',
        parameters: SearchUserSchema,
        async execute(_toolCallId, params) {
            const p = params;
            try {
                const client = toolClient();
                log.info(`search_user: query="${p.query}", page_size=${p.page_size ?? 20}`);
                const requestQuery = {
                    query: p.query,
                    page_size: String(p.page_size ?? 20),
                };
                if (p.page_token)
                    requestQuery.page_token = p.page_token;
                const res = await client.invokeByPath('feishu_search_user.default', '/open-apis/search/v1/user', {
                    method: 'GET',
                    query: requestQuery,
                    as: 'user',
                });
                (0, helpers_1.assertLarkOk)(res);
                const data = res.data;
                const users = data?.users ?? [];
                const userCount = users.length;
                log.info(`search_user: found ${userCount} users`);
                return (0, helpers_1.json)({
                    users,
                    has_more: data?.has_more ?? false,
                    page_token: data?.page_token,
                });
            }
            catch (err) {
                return await (0, helpers_1.handleInvokeErrorWithAutoAuth)(err, cfg);
            }
        },
    }, { name: 'feishu_search_user' });
}
