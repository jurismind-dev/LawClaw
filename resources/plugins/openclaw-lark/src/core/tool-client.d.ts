/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * ToolClient — 工具层统一客户端。
 *
 * 专为 `src/tools/` 下的工具设计，封装 account 解析、SDK 管理、
 * TAT/UAT 自动切换和 scope 预检。工具代码只需声明 API 名称和调用逻辑，
 * 身份选择/scope 校验/token 管理全部由 `invoke()` 内聚处理。
 *
 * 用法：
 * ```typescript
 * const client = createToolClient(config);
 *
 * // UAT 调用 — 通过 { as: "user" } 指定用户身份
 * const res = await client.invoke(
 *   "calendar.v4.calendarEvent.create",
 *   (sdk, opts) => sdk.calendar.calendarEvent.create(payload, opts),
 *   { as: "user" },
 * );
 *
 * // TAT 调用 — 默认走应用身份
 * const res = await client.invoke(
 *   "calendar.v4.calendar.list",
 *   (sdk) => sdk.calendar.calendar.list(payload),
 *   { as: "tenant" },
 * );
 * ```
 */
import * as Lark from '@larksuiteoapi/node-sdk';
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
import type { ConfiguredLarkAccount } from './types';
import { type ToolActionKey } from './scope-manager';
import { LARK_ERROR, NeedAuthorizationError, AppScopeCheckFailedError, AppScopeMissingError, UserAuthRequiredError, UserScopeInsufficientError } from './auth-errors';
import type { ScopeErrorInfo, AuthHint, TryInvokeResult } from './auth-errors';
export { LARK_ERROR, NeedAuthorizationError, AppScopeCheckFailedError, AppScopeMissingError, UserAuthRequiredError, UserScopeInsufficientError, };
export type { ScopeErrorInfo, AuthHint, TryInvokeResult };
/** Per-request options returned by `Lark.withUserAccessToken()`. */
type LarkRequestOptions = ReturnType<typeof Lark.withUserAccessToken>;
/**
 * @deprecated 使用 `InvokeFn` 代替。
 * Callback that receives the SDK client and per-request UAT options.
 */
export type ApiFn<T> = (sdk: Lark.Client, opts: LarkRequestOptions) => Promise<T>;
/**
 * invoke() 的回调签名。
 *
 * - UAT 模式：`opts` 为 `Lark.withUserAccessToken(token)`，需传给 SDK 方法；`uat` 为 User Access Token 原始字符串
 * - TAT 模式：`opts` 为 `undefined`，SDK 默认走应用身份；`uat` 也为 `undefined`
 */
export type InvokeFn<T> = (sdk: Lark.Client, opts?: LarkRequestOptions, uat?: string) => Promise<T>;
/** invoke() 的选项。 */
export interface InvokeOptions {
    /** 强制 token 类型。省略时根据 API meta 自动选择（优先 user）。 */
    as?: 'user' | 'tenant';
    /** 覆盖 senderOpenId。 */
    userOpenId?: string;
}
/** invokeByPath() 的选项 — 在 InvokeOptions 基础上增加 HTTP 请求参数。 */
export type InvokeByPathOptions = InvokeOptions & {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    query?: Record<string, string>;
    /** 自定义请求 header，会与 Authorization / Content-Type 合并（自定义优先）。 */
    headers?: Record<string, string>;
};
export declare class ToolClient {
    readonly config: ClawdbotConfig;
    /** 当前解析的账号信息（appId、appSecret 保证存在）。 */
    readonly account: ConfiguredLarkAccount;
    /** 当前请求的用户 open_id（来自 LarkTicket，可能为 undefined）。 */
    readonly senderOpenId: string | undefined;
    /** Lark SDK 实例（TAT 身份），直接调用即可。 */
    readonly sdk: Lark.Client;
    constructor(params: {
        account: ConfiguredLarkAccount;
        senderOpenId: string | undefined;
        sdk: Lark.Client;
        config: ClawdbotConfig;
    });
    /**
     * 统一 API 调用入口。
     *
     * 自动处理：
     * - 根据 API meta 选择 UAT / TAT
     * - 严格模式：检查应用和用户是否拥有所有 API 要求的 scope
     * - 无 token 或 scope 不足时抛出结构化错误
     * - UAT 模式下复用 callWithUAT 的 refresh + retry
     *
     * @param apiName - meta.json 中的 toolName，如 `"calendar.v4.calendarEvent.create"`
     * @param fn - API 调用逻辑。UAT 时 opts 已注入 token，TAT 时 opts 为 undefined。
     * @param options - 可选配置：
     *   - `as`: 指定 UAT/TAT
     *   - `userOpenId`: 覆盖用户 ID
     *
     * @throws {@link AppScopeMissingError} 应用未开通 API 所需 scope
     * @throws {@link UserAuthRequiredError} 用户未授权或 scope 不足
     * @throws {@link UserScopeInsufficientError} 服务端报用户 scope 不足
     *
     * @example
     * // UAT 调用 — 通过 { as: "user" } 指定
     * const res = await client.invoke(
     *   "calendar.v4.calendarEvent.create",
     *   (sdk, opts) => sdk.calendar.calendarEvent.create(payload, opts),
     *   { as: "user" },
     * );
     *
     * @example
     * // TAT 调用
     * const res = await client.invoke(
     *   "calendar.v4.calendar.list",
     *   (sdk) => sdk.calendar.calendar.list(payload),
     *   { as: "tenant" },
     * );
     *
     */
    invoke<T>(toolAction: ToolActionKey, fn: InvokeFn<T>, options?: InvokeOptions): Promise<T>;
    /**
     * 内部 invoke 实现，只支持 ToolActionKey（严格类型检查）
     */
    private _invokeInternal;
    /**
     * invoke() 的非抛出包装，适用于"允许失败"的子操作。
     *
     * - 成功 → `{ ok: true, data }`
     * - 用户授权错误（可通过 OAuth 恢复）→ `{ ok: false, authHint }`
     * - 应用权限缺失 / appScopeVerified=false → **仍然 throw**（需管理员操作）
     * - 其他错误 → `{ ok: false, error }`
     */
    /**
     * 对 SDK 未覆盖的飞书 API 发起 raw HTTP 请求，同时复用 invoke() 的
     * auth/scope/refresh 全链路。
     *
     * @param apiName - 逻辑 API 名称（用于日志和错误信息），如 `"im.v1.chatP2p.batchQuery"`
     * @param path - API 路径（以 `/open-apis/` 开头），如 `"/open-apis/im/v1/chat_p2p/batch_query"`
     * @param options - HTTP 方法、body、query 及 InvokeOptions（as、userOpenId 等）
     *
     * @example
     * ```typescript
     * const res = await client.invokeByPath<{ data: { items: Array<{ chat_id: string }> } }>(
     *   "im.v1.chatP2p.batchQuery",
     *   "/open-apis/im/v1/chat_p2p/batch_query",
     *   {
     *     method: "POST",
     *     body: { chatter_ids: [openId] },
     *     as: "user",
     *   },
     * );
     * ```
     */
    invokeByPath<T = any>(toolAction: ToolActionKey, path: string, options?: InvokeByPathOptions): Promise<T>;
    private invokeAsTenant;
    private invokeAsUser;
    /**
     * 发起 raw HTTP 请求到飞书 API，委托 rawLarkRequest 处理。
     */
    private rawRequest;
    /**
     * 识别飞书服务端错误码并转换为结构化错误。
     *
     * - LARK_ERROR.APP_SCOPE_MISSING (99991672) → AppScopeMissingError（清缓存后抛出）
     * - LARK_ERROR.USER_SCOPE_INSUFFICIENT (99991679) → UserScopeInsufficientError
     */
    private rethrowStructuredError;
}
/**
 * 从配置创建 {@link ToolClient}。
 *
 * 自动从当前 {@link LarkTicket} 解析 accountId 和 senderOpenId。
 * 如果 LarkTicket 不可用（如非消息场景），回退到 `accountIndex`
 * 指定的账号。
 *
 * @param config - OpenClaw 配置对象
 * @param accountIndex - 回退账号索引（默认 0）
 */
export declare function createToolClient(config: ClawdbotConfig, accountIndex?: number): ToolClient;
