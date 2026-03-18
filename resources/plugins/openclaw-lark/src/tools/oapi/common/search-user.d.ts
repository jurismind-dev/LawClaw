/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_search_user tool -- 搜索员工
 *
 * 通过关键词搜索员工，结果按亲密度排序
 * 使用搜索接口（/open-apis/search/v1/user）
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerSearchUserTool(api: OpenClawPluginApi): void;
