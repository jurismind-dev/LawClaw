/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * OAPI Tools Index
 *
 * This module registers all tools that directly use Feishu Open API (OAPI).
 * These tools are placed here to distinguish them from MCP-based tools.
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerOapiTools(api: OpenClawPluginApi): void;
