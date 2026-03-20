/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * MCP 工具的共享代码（所有业务域共享）
 * 包含：MCP 客户端、类型定义、通用辅助函数
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { TSchema } from '@sinclair/typebox';
import type { LarkBrand } from '../../core/types';
export interface McpRpcSuccess {
    jsonrpc: '2.0';
    id: number | string;
    result: unknown;
}
export interface McpRpcError {
    jsonrpc: '2.0';
    id: number | string | null;
    error: {
        code: number;
        message: string;
        data?: unknown;
    };
}
export type McpRpcResponse = McpRpcSuccess | McpRpcError;
import type { ToolActionKey } from '../../core/scope-manager';
export interface McpToolConfig<T = unknown> {
    name: string;
    mcpToolName: string;
    toolActionKey: ToolActionKey;
    label: string;
    description: string;
    schema: TSchema;
    validate?: (params: T) => void;
}
export declare function isRecord(v: unknown): v is Record<string, unknown>;
/**
 * 从配置对象中提取 MCP endpoint URL
 */
export declare function extractMcpUrlFromConfig(cfg: unknown): string | undefined;
/**
 * 部分 MCP 网关/代理会在 result 内再次包一层 JSON-RPC envelope。
 * 这里做一次递归解包，确保工具最终返回的是纯 result JSON（不包含 jsonrpc/id）。
 */
export declare function unwrapJsonRpcResult(v: unknown): unknown;
export declare function setMcpEndpointOverride(endpoint: string | undefined): void;
/**
 * 调用 MCP 工具
 * @param name MCP 工具名称
 * @param args 工具参数
 * @param toolCallId 工具调用 ID
 * @param uat 用户访问令牌(由 invoke 权限检查后传入)
 * @param brand 当前账号品牌，用于选择 MCP 端点域名
 */
export declare function callMcpTool(name: string, args: Record<string, unknown>, toolCallId: string, uat: string, brand?: LarkBrand): Promise<unknown>;
/**
 * 注册 MCP 工具的通用函数 (使用 invoke 机制进行权限检查)
 */
export declare function registerMcpTool<T extends Record<string, unknown>>(api: OpenClawPluginApi, config: McpToolConfig<T>): void;
