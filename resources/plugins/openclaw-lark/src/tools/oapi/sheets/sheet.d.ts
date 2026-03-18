/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_sheet — 飞书电子表格统一工具。
 *
 * Actions: info, read, write, append, find, create, export
 *
 * 设计原则：
 *   - 接受 URL 或 spreadsheet_token（工具层自动解析）
 *   - read 不指定 range 时自动读取第一个工作表全部数据
 *   - create 支持带表头和初始数据一步创建
 *   - info 一次返回表格信息 + 全部工作表列表
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuSheetTool(api: OpenClawPluginApi): void;
