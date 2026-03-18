/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * 消息读取工具集 -- 以用户身份获取/搜索飞书消息
 *
 * 包含：
 *   - feishu_im_user_get_messages       (chat_id / open_id → 会话消息)
 *   - feishu_im_user_get_thread_messages (thread_id → 话题消息)
 *   - feishu_im_user_search_messages     (跨会话关键词搜索)
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerMessageReadTools(api: OpenClawPluginApi): void;
