"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_doc_comments tool -- 云文档评论管理
 *
 * 支持获取、创建、解决/恢复云文档评论
 * 使用以下 SDK 接口:
 * - sdk.drive.v1.fileComment.list - 获取评论列表
 * - sdk.drive.v1.fileComment.create - 创建全文评论
 * - sdk.drive.v1.fileComment.patch - 解决/恢复评论
 * - sdk.drive.v1.fileCommentReply.list - 获取回复列表
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDocCommentsTool = registerDocCommentsTool;
const typebox_1 = require("@sinclair/typebox");
const helpers_1 = require("../helpers.js");
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const ReplyElementSchema = typebox_1.Type.Object({
    type: (0, helpers_1.StringEnum)(['text', 'mention', 'link']),
    text: typebox_1.Type.Optional(typebox_1.Type.String({ description: '文本内容(type=text时必填)' })),
    open_id: typebox_1.Type.Optional(typebox_1.Type.String({ description: '被@用户的open_id(type=mention时必填)' })),
    url: typebox_1.Type.Optional(typebox_1.Type.String({ description: '链接URL(type=link时必填)' })),
});
const DocCommentsSchema = typebox_1.Type.Object({
    action: (0, helpers_1.StringEnum)(['list', 'list_replies', 'create', 'reply', 'patch']),
    file_token: typebox_1.Type.String({
        description: '云文档token或wiki节点token(可从文档URL获取)。如果是wiki token，会自动转换为实际文档的obj_token',
    }),
    file_type: (0, helpers_1.StringEnum)(['doc', 'docx', 'sheet', 'file', 'slides', 'wiki'], {
        description: '文档类型。wiki类型会自动解析为实际文档类型(docx/sheet/bitable等)',
    }),
    // list action参数
    is_whole: typebox_1.Type.Optional(typebox_1.Type.Boolean({
        description: '是否只获取全文评论(action=list时可选)',
    })),
    is_solved: typebox_1.Type.Optional(typebox_1.Type.Boolean({
        description: '是否只获取已解决的评论(action=list时可选)',
    })),
    page_size: typebox_1.Type.Optional(typebox_1.Type.Integer({ description: '分页大小' })),
    page_token: typebox_1.Type.Optional(typebox_1.Type.String({ description: '分页标记' })),
    // create / reply action参数
    elements: typebox_1.Type.Optional(typebox_1.Type.Array(ReplyElementSchema, {
        description: '评论内容元素数组(action=create/reply时必填)。' + '支持text(纯文本)、mention(@用户)、link(超链接)三种类型',
    })),
    // list_replies / reply / patch action参数
    comment_id: typebox_1.Type.Optional(typebox_1.Type.String({
        description: '评论ID(action=list_replies/reply/patch时必填)',
    })),
    is_solved_value: typebox_1.Type.Optional(typebox_1.Type.Boolean({
        description: '解决状态:true=解决,false=恢复(action=patch时必填)',
    })),
    user_id_type: typebox_1.Type.Optional((0, helpers_1.StringEnum)(['open_id', 'union_id', 'user_id'])),
});
// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------
function convertElementsToSDKFormat(elements) {
    return elements.map((el) => {
        if (el.type === 'text') {
            return {
                type: 'text_run',
                text_run: { text: el.text },
            };
        }
        else if (el.type === 'mention') {
            return {
                type: 'person',
                person: { user_id: el.open_id },
            };
        }
        else if (el.type === 'link') {
            return {
                type: 'docs_link',
                docs_link: { url: el.url },
            };
        }
        return { type: 'text_run', text_run: { text: '' } };
    });
}
/**
 * 组装评论和回复数据
 * 获取评论列表API会返回部分回复,但可能不完整
 * 此函数会为每个评论获取完整的回复列表
 */
async function assembleCommentsWithReplies(client, file_token, file_type, comments, user_id_type, log) {
    const result = [];
    for (const comment of comments) {
        const assembled = { ...comment };
        // 如果评论有回复,获取完整的回复列表
        if (comment.reply_list?.replies?.length > 0 || comment.has_more) {
            try {
                const replies = [];
                let pageToken = undefined;
                let hasMore = true;
                while (hasMore) {
                    const replyRes = await client.invoke('drive.v1.fileCommentReply.list', (sdk, opts) => sdk.drive.v1.fileCommentReply.list({
                        path: {
                            file_token,
                            comment_id: comment.comment_id,
                        },
                        params: {
                            file_type,
                            page_token: pageToken,
                            page_size: 50,
                            user_id_type,
                        },
                    }, opts), { as: 'tenant' });
                    const replyData = replyRes.data;
                    if (replyRes.code === 0 && replyData?.items) {
                        replies.push(...(replyData.items || []));
                        hasMore = replyData.has_more || false;
                        pageToken = replyData.page_token;
                    }
                    else {
                        break;
                    }
                }
                assembled.reply_list = { replies };
                log.info(`Assembled ${replies.length} replies for comment ${comment.comment_id}`);
            }
            catch (err) {
                log.warn(`Failed to fetch replies for comment ${comment.comment_id}: ${err}`);
                // 保留原始回复数据
            }
        }
        result.push(assembled);
    }
    return result;
}
// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
function registerDocCommentsTool(api) {
    if (!api.config)
        return false;
    const cfg = api.config;
    const { toolClient, log } = (0, helpers_1.createToolContext)(api, 'feishu_doc_comments');
    return (0, helpers_1.registerTool)(api, {
        name: 'feishu_doc_comments',
        label: 'Feishu: Doc Comments',
        description: '【以用户身份】管理云文档评论。支持: ' +
            '(1) list - 获取评论列表(含完整回复); ' +
            '(2) list_replies - 获取指定评论的回复列表; ' +
            '(3) create - 添加全文评论(支持文本、@用户、超链接); ' +
            '(4) reply - 回复已有评论; ' +
            '(5) patch - 解决/恢复评论。' +
            '支持 wiki token。',
        parameters: DocCommentsSchema,
        async execute(_toolCallId, params) {
            const p = params;
            try {
                const client = toolClient();
                const userIdType = p.user_id_type || 'open_id';
                // 如果是 wiki token，先转换为实际的 obj_token 和 obj_type
                let actualFileToken = p.file_token;
                let actualFileType = p.file_type;
                if (p.file_type === 'wiki') {
                    log.info(`doc_comments: detected wiki token="${p.file_token}", converting to obj_token...`);
                    try {
                        const wikiNodeRes = await client.invoke('feishu_wiki_space_node.get', (sdk, opts) => sdk.wiki.space.getNode({
                            params: {
                                token: p.file_token,
                                obj_type: 'wiki',
                            },
                        }, opts), { as: 'user' });
                        (0, helpers_1.assertLarkOk)(wikiNodeRes);
                        const node = wikiNodeRes.data?.node;
                        if (!node || !node.obj_token || !node.obj_type) {
                            return (0, helpers_1.json)({
                                error: `failed to resolve wiki token "${p.file_token}" to document object (may be a folder node rather than a document)`,
                                wiki_node: node,
                            });
                        }
                        actualFileToken = node.obj_token;
                        actualFileType = node.obj_type;
                        log.info(`doc_comments: wiki token converted, obj_type="${actualFileType}"`);
                    }
                    catch (err) {
                        log.error(`doc_comments: failed to convert wiki token: ${err}`);
                        return (0, helpers_1.json)({
                            error: `failed to resolve wiki token "${p.file_token}": ${err}`,
                        });
                    }
                }
                // Action: list - 获取评论列表
                if (p.action === 'list') {
                    log.info(`doc_comments.list: file_type=${actualFileType}`);
                    const res = await client.invoke('feishu_doc_comments.list', (sdk, opts) => sdk.drive.v1.fileComment.list({
                        path: { file_token: actualFileToken },
                        params: {
                            file_type: actualFileType,
                            is_whole: p.is_whole,
                            is_solved: p.is_solved,
                            page_size: p.page_size || 50,
                            page_token: p.page_token,
                            user_id_type: userIdType,
                        },
                    }, opts), { as: 'tenant' });
                    (0, helpers_1.assertLarkOk)(res);
                    const items = res.data?.items || [];
                    log.info(`doc_comments.list: found ${items.length} comments`);
                    // 组装评论和完整回复
                    const assembledItems = await assembleCommentsWithReplies(client, actualFileToken, actualFileType, items, userIdType, log);
                    return (0, helpers_1.json)({
                        items: assembledItems,
                        has_more: res.data?.has_more ?? false,
                        page_token: res.data?.page_token,
                    });
                }
                // Action: list_replies - 获取指定评论的回复列表
                if (p.action === 'list_replies') {
                    if (!p.comment_id) {
                        return (0, helpers_1.json)({ error: 'comment_id 参数必填' });
                    }
                    log.info(`doc_comments.list_replies: comment_id="${p.comment_id}"`);
                    // Single-page fetch — return items + pagination metadata,
                    // consistent with the list action's API semantics.
                    const replyRes = await client.invoke('feishu_doc_comments.list_replies', (sdk, opts) => sdk.drive.v1.fileCommentReply.list({
                        path: {
                            file_token: actualFileToken,
                            comment_id: p.comment_id,
                        },
                        params: {
                            file_type: actualFileType,
                            page_token: p.page_token,
                            page_size: p.page_size || 50,
                            user_id_type: userIdType,
                        },
                    }, opts), { as: 'tenant' });
                    (0, helpers_1.assertLarkOk)(replyRes);
                    const replyData = replyRes.data;
                    log.info(`doc_comments.list_replies: found ${replyData?.items?.length ?? 0} replies`);
                    return (0, helpers_1.json)({
                        items: replyData?.items ?? [],
                        has_more: replyData?.has_more ?? false,
                        page_token: replyData?.page_token,
                    });
                }
                // Action: create - 创建评论
                if (p.action === 'create') {
                    if (!p.elements || p.elements.length === 0) {
                        return (0, helpers_1.json)({
                            error: 'elements 参数必填且不能为空',
                        });
                    }
                    log.info(`doc_comments.create: file_type=${actualFileType}, elements=${p.elements.length}`);
                    const sdkElements = convertElementsToSDKFormat(p.elements);
                    const commentData = {
                        reply_list: {
                            replies: [
                                {
                                    content: {
                                        elements: sdkElements,
                                    },
                                },
                            ],
                        },
                    };
                    const res = await client.invoke('feishu_doc_comments.create', (sdk, opts) => sdk.drive.v1.fileComment.create({
                        path: { file_token: actualFileToken },
                        params: {
                            file_type: actualFileType,
                            user_id_type: userIdType,
                        },
                        data: commentData,
                    }, opts), { as: 'tenant' });
                    (0, helpers_1.assertLarkOk)(res);
                    log.info(`doc_comments.create: created comment ${res.data?.comment_id}`);
                    return (0, helpers_1.json)(res.data);
                }
                // Action: reply - 回复已有评论
                if (p.action === 'reply') {
                    if (!p.comment_id) {
                        return (0, helpers_1.json)({ error: 'comment_id 参数必填' });
                    }
                    if (!p.elements || p.elements.length === 0) {
                        return (0, helpers_1.json)({ error: 'elements 参数必填且不能为空' });
                    }
                    log.info(`doc_comments.reply: comment_id="${p.comment_id}", elements=${p.elements.length}`);
                    const sdkElements = convertElementsToSDKFormat(p.elements);
                    // 使用 sdk.request() 发起请求（与 deliver.ts 一致），SDK 内部自动管理 TAT。
                    // 双重 payload 格式兜底：先试 content.elements，失败再试 reply_elements。
                    const replyUrl = `/open-apis/drive/v1/files/${actualFileToken}/comments/${p.comment_id}/replies`;
                    const replyParams = { file_type: actualFileType, user_id_type: userIdType };
                    let res;
                    try {
                        res = await client.invoke('feishu_doc_comments.reply', (sdk) => sdk.request({
                            method: 'POST',
                            url: replyUrl,
                            params: replyParams,
                            data: { content: { elements: sdkElements } },
                        }), { as: 'tenant' });
                    }
                    catch (_firstErr) {
                        // Fallback: 部分 API 版本使用 reply_elements 格式
                        log.info(`doc_comments.reply: first attempt failed, trying reply_elements format`);
                        res = await client.invoke('feishu_doc_comments.reply', (sdk) => sdk.request({
                            method: 'POST',
                            url: replyUrl,
                            params: replyParams,
                            data: { reply_elements: sdkElements },
                        }), { as: 'tenant' });
                    }
                    (0, helpers_1.assertLarkOk)(res);
                    log.info(`doc_comments.reply: created reply`);
                    return (0, helpers_1.json)(res.data ?? res);
                }
                // Action: patch - 解决/恢复评论
                if (p.action === 'patch') {
                    if (!p.comment_id) {
                        return (0, helpers_1.json)({
                            error: 'comment_id 参数必填',
                        });
                    }
                    if (p.is_solved_value === undefined) {
                        return (0, helpers_1.json)({
                            error: 'is_solved_value 参数必填',
                        });
                    }
                    log.info(`doc_comments.patch: comment_id="${p.comment_id}", is_solved=${p.is_solved_value}`);
                    const res = await client.invoke('feishu_doc_comments.patch', (sdk, opts) => sdk.drive.v1.fileComment.patch({
                        path: {
                            file_token: actualFileToken,
                            comment_id: p.comment_id,
                        },
                        params: {
                            file_type: actualFileType,
                        },
                        data: {
                            is_solved: p.is_solved_value,
                        },
                    }, opts), { as: 'user' });
                    (0, helpers_1.assertLarkOk)(res);
                    log.info(`doc_comments.patch: success`);
                    return (0, helpers_1.json)({ success: true });
                }
                return (0, helpers_1.json)({
                    error: `未知的 action: ${p.action}`,
                });
            }
            catch (err) {
                return await (0, helpers_1.handleInvokeErrorWithAutoAuth)(err, cfg);
            }
        },
    }, { name: 'feishu_doc_comments' });
}
