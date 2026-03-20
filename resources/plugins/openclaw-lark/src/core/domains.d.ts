/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Centralized domain helpers for Feishu / Lark brand-aware URL generation.
 *
 * All runtime code that needs to construct platform URLs should use these
 * helpers instead of hardcoding domain strings.
 */
import type { LarkBrand } from './types';
/** 开放平台域名 (API & 权限管理页面) */
export declare function openPlatformDomain(brand?: LarkBrand): string;
/** Applink 域名 */
export declare function applinkDomain(brand?: LarkBrand): string;
/** 主站域名 (文档、表格等用户可见链接) */
export declare function wwwDomain(brand?: LarkBrand): string;
/** MCP 服务域名 */
export declare function mcpDomain(brand?: LarkBrand): string;
