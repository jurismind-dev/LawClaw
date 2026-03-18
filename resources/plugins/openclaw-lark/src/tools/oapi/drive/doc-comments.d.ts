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
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerDocCommentsTool(api: OpenClawPluginApi): void;
