/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_im_user_fetch_resource tool -- 以用户身份下载 IM 消息中的文件/图片资源
 *
 * 使用飞书 API:
 *   - im.v1.messageResource.get: GET /open-apis/im/v1/messages/:message_id/resources/:file_key
 *
 * 全部以用户身份（user_access_token）调用，scope 来自 real-scope.json。
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuImUserFetchResourceTool(api: OpenClawPluginApi): void;
