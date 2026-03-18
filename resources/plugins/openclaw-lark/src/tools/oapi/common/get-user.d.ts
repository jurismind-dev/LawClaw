/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_get_user tool -- 获取用户信息
 *
 * 支持两种模式:
 * 1. 不传 user_id: 获取当前用户自己的信息 (sdk.authen.userInfo.get)
 * 2. 传 user_id: 获取指定用户的信息 (sdk.contact.v3.user.get)
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerGetUserTool(api: OpenClawPluginApi): void;
