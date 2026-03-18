/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * raw-request.ts — 飞书 Open API 裸 HTTP 请求工具。
 *
 * 从 tool-client.ts 提取，提供不依赖 SDK 的直接 API 调用能力。
 * 用于 SDK 未覆盖的 API 或需要精细控制请求的场景。
 */
import type { LarkBrand } from './types';
/** 将 LarkBrand 映射为 API base URL。 */
export declare function resolveDomainUrl(brand: LarkBrand): string;
export interface RawLarkRequestOptions {
    brand: LarkBrand;
    path: string;
    method?: string;
    body?: unknown;
    query?: Record<string, string>;
    headers?: Record<string, string>;
    accessToken?: string;
}
/**
 * 发起 raw HTTP 请求到飞书 API，自动处理域名解析、header 注入和错误检测。
 *
 * 飞书 API 统一错误模式：返回 JSON 中 `code !== 0` 表示失败。
 */
export declare function rawLarkRequest<T>(options: RawLarkRequestOptions): Promise<T>;
