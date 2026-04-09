/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_im_bot_image 工具
 *
 * 以机器人身份下载飞书 IM 消息中的图片/文件资源到本地。
 *
 * 飞书 API:
 *   - 下载资源: GET  /open-apis/im/v1/messages/:message_id/resources/:file_key
 * 权限: im:resource
 * 凭证: tenant_access_token
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuImBotImageTool(api: OpenClawPluginApi): boolean;
