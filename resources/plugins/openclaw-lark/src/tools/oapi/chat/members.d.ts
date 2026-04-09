/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_chat_members tool -- 获取群成员列表
 *
 * 获取指定群组的成员信息，包括成员名字与 ID
 * 使用 sdk.im.v1.chatMembers.get 接口
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerChatMembersTool(api: OpenClawPluginApi): boolean;
