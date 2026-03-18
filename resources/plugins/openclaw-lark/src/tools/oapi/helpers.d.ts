/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * OAPI 工具专用辅助函数
 *
 * 提供 OAPI 工具特有的功能（如时间转换），并复用通用辅助函数。
 */
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
import type { Client as LarkClient } from '@larksuiteoapi/node-sdk';
export { formatToolResult, formatToolError, createToolLogger, createClientGetter, createToolContext, getFirstAccount, validateRequiredParams, validateEnum, } from '../helpers';
export type { ToolResult, ClientGetter, ToolContext } from '../helpers';
export { ToolClient, createToolClient, NeedAuthorizationError, AppScopeMissingError, UserAuthRequiredError, UserScopeInsufficientError, } from '../../core/tool-client';
export type { ApiFn, InvokeFn, InvokeOptions, InvokeByPathOptions, AuthHint, TryInvokeResult, } from '../../core/tool-client';
/**
 * 从配置直接创建飞书客户端（OAPI 工具常用模式）
 *
 * 这是对 createClientGetter 的简化封装，直接返回客户端实例而非 getter 函数。
 *
 * @param config - OpenClaw 配置对象
 * @returns 飞书 SDK 客户端实例
 * @throws 如果没有启用的账号
 *
 * @example
 * ```typescript
 * export function registerMyOapiTool(api: OpenClawPluginApi) {
 *   api.registerTool({
 *     name: "my_oapi_tool",
 *     async execute(_toolCallId, params) {
 *       const client = createFeishuClientFromConfig(api.config);
 *       const res = await client.calendar.calendarEvent.list({ ... });
 *       return json(res.data);
 *     }
 *   });
 * }
 * ```
 */
export declare function createFeishuClientFromConfig(config: ClawdbotConfig): LarkClient;
/**
 * 格式化返回值为 JSON（OAPI 工具常用简化接口）
 *
 * 这是对 formatToolResult 的简化封装，函数名更短便于频繁使用。
 *
 * @param data - 要返回的数据
 * @returns 格式化的工具返回值
 *
 * @example
 * ```typescript
 * return json({ task: taskData });
 * return json({ error: "Invalid parameter" });
 * ```
 */
export declare function json(data: unknown): any;
/**
 * 解析时间字符串为 Unix 时间戳（秒）
 *
 * 支持多种格式：
 * 1. ISO 8601 / RFC 3339（带时区）："2024-01-01T00:00:00+08:00"
 * 2. 不带时区的格式（默认为北京时间 UTC+8）：
 *    - "2026-02-25 14:30"
 *    - "2026-02-25 14:30:00"
 *    - "2026-02-25T14:30:00"
 *
 * @param input - 时间字符串
 * @returns Unix 时间戳字符串（秒），解析失败返回 null
 *
 * @example
 * ```typescript
 * parseTimeToTimestamp("2026-02-25T14:30:00+08:00")  // => "1740459000"
 * parseTimeToTimestamp("2026-02-25 14:30")           // => "1740459000" (默认北京时间)
 * parseTimeToTimestamp("2026-02-25T14:30:00")        // => "1740459000" (默认北京时间)
 * parseTimeToTimestamp("invalid")                    // => null
 * ```
 */
export declare function parseTimeToTimestamp(input: string): string | null;
/**
 * 解析时间字符串为 Unix 时间戳（毫秒）
 *
 * 支持多种格式：
 * 1. ISO 8601 / RFC 3339（带时区）："2024-01-01T00:00:00+08:00"
 * 2. 不带时区的格式（默认为北京时间 UTC+8）：
 *    - "2026-02-25 14:30"
 *    - "2026-02-25 14:30:00"
 *    - "2026-02-25T14:30:00"
 *
 * @param input - 时间字符串
 * @returns Unix 时间戳字符串（毫秒），解析失败返回 null
 *
 * @example
 * ```typescript
 * parseTimeToTimestampMs("2026-02-25T14:30:00+08:00")  // => "1740459000000"
 * parseTimeToTimestampMs("2026-02-25 14:30")           // => "1740459000000" (默认北京时间)
 * parseTimeToTimestampMs("2026-02-25T14:30:00")        // => "1740459000000" (默认北京时间)
 * parseTimeToTimestampMs("invalid")                    // => null
 * ```
 */
export declare function parseTimeToTimestampMs(input: string): string | null;
/**
 * 解析时间字符串为 RFC 3339 格式（用于 freebusy API）
 *
 * 支持多种格式：
 * 1. ISO 8601 / RFC 3339（带时区）："2024-01-01T00:00:00+08:00" - 直接返回
 * 2. 不带时区的格式（默认为北京时间 UTC+8）：
 *    - "2026-02-25 14:30" - 转换为 "2026-02-25T14:30:00+08:00"
 *    - "2026-02-25 14:30:00" - 转换为 "2026-02-25T14:30:00+08:00"
 *    - "2026-02-25T14:30:00" - 转换为 "2026-02-25T14:30:00+08:00"
 *
 * @param input - 时间字符串
 * @returns RFC 3339 格式的时间字符串，解析失败返回 null
 *
 * @example
 * ```typescript
 * parseTimeToRFC3339("2026-02-25T14:30:00+08:00")  // => "2026-02-25T14:30:00+08:00"
 * parseTimeToRFC3339("2026-02-25 14:30")           // => "2026-02-25T14:30:00+08:00"
 * parseTimeToRFC3339("2026-02-25T14:30:00")        // => "2026-02-25T14:30:00+08:00"
 * ```
 */
export declare function parseTimeToRFC3339(input: string): string | null;
/**
 * 转换时间范围对象（用于 search 等 API）
 *
 * 将包含 ISO 8601 格式时间字符串的时间范围转换为时间戳。
 *
 * @param timeRange - 时间范围对象，包含可选的 start 和 end 字段
 * @param unit - 时间戳单位，'s' 为秒，'ms' 为毫秒，默认为 's'
 * @returns 转换后的时间范围对象，包含数字类型的时间戳
 * @throws 如果时间格式错误
 *
 * @example
 * ```typescript
 * convertTimeRange({ start: "2026-02-25T14:00:00+08:00", end: "2026-02-25T18:00:00+08:00" })
 * // => { start: 1740459000, end: 1740473400 }
 *
 * convertTimeRange({ start: "2026-02-25T14:00:00+08:00" }, 'ms')
 * // => { start: 1740459000000 }
 * ```
 */
export declare function convertTimeRange(timeRange: {
    start?: string;
    end?: string;
} | undefined, unit?: 's' | 'ms'): {
    start?: number;
    end?: number;
} | undefined;
export declare const SHANGHAI_UTC_OFFSET_HOURS = 8;
export declare const SHANGHAI_OFFSET_SUFFIX = "+08:00";
export declare function pad2(value: number): string;
/**
 * Convert a Unix timestamp (seconds or milliseconds) to ISO 8601 string
 * in the Asia/Shanghai timezone.
 *
 * Auto-detects seconds vs milliseconds based on magnitude.
 *
 * @returns e.g. `"2026-02-25T14:30:00+08:00"`, or `null` on invalid input
 */
export declare function unixTimestampToISO8601(raw: string | number | undefined): string | null;
/**
 * Re-export 飞书 API 错误处理函数
 *
 * 这些函数专门用于处理飞书 Open API 的响应和错误。
 */
export { assertLarkOk, formatLarkError } from '../../core/api-error';
/**
 * Check whether an error is a structured invoke-level auth/permission error.
 *
 * Useful in intermediate catch blocks that need to let auth errors bubble up
 * to the outer `handleInvokeErrorWithAutoAuth`.
 *
 * For "allow-to-fail" sub-operations, prefer `client.tryInvoke()` over
 * manual `isInvokeError` + throw.
 */
export declare function isInvokeError(err: unknown): boolean;
export { handleInvokeErrorWithAutoAuth } from '../auto-auth';
