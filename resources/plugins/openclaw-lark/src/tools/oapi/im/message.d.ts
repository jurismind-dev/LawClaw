/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_im_user_message tool -- 以用户身份发送/回复 IM 消息
 *
 * Actions: send, reply
 *
 * Uses the Feishu IM API:
 *   - send:  POST /open-apis/im/v1/messages?receive_id_type=...
 *   - reply: POST /open-apis/im/v1/messages/:message_id/reply
 *
 * 全部以用户身份（user_access_token）调用，scope 来自 real-scope.json。
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuImUserMessageTool(api: OpenClawPluginApi): boolean;
