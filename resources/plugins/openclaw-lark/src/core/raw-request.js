"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * raw-request.ts — 飞书 Open API 裸 HTTP 请求工具。
 *
 * 从 tool-client.ts 提取，提供不依赖 SDK 的直接 API 调用能力。
 * 用于 SDK 未覆盖的 API 或需要精细控制请求的场景。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveDomainUrl = resolveDomainUrl;
exports.rawLarkRequest = rawLarkRequest;
const feishu_fetch_1 = require("./feishu-fetch.js");
// ---------------------------------------------------------------------------
// Domain URL resolution
// ---------------------------------------------------------------------------
/** 将 LarkBrand 映射为 API base URL。 */
function resolveDomainUrl(brand) {
    const map = {
        feishu: 'https://open.feishu.cn',
        lark: 'https://open.larksuite.com',
    };
    return map[brand] ?? `https://${brand}`;
}
/**
 * 发起 raw HTTP 请求到飞书 API，自动处理域名解析、header 注入和错误检测。
 *
 * 飞书 API 统一错误模式：返回 JSON 中 `code !== 0` 表示失败。
 */
async function rawLarkRequest(options) {
    const baseUrl = resolveDomainUrl(options.brand);
    const url = new URL(options.path, baseUrl);
    if (options.query) {
        for (const [k, v] of Object.entries(options.query)) {
            url.searchParams.set(k, v);
        }
    }
    const headers = {};
    if (options.accessToken) {
        headers['Authorization'] = `Bearer ${options.accessToken}`;
    }
    if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }
    if (options.headers) {
        Object.assign(headers, options.headers);
    }
    const resp = await (0, feishu_fetch_1.feishuFetch)(url.toString(), {
        method: options.method ?? 'GET',
        headers,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await resp.json());
    // 飞书 API 统一错误模式：code !== 0
    if (data.code !== undefined && data.code !== 0) {
        const err = new Error(data.msg ?? `Lark API error: code=${data.code}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        err.code = data.code;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        err.msg = data.msg;
        throw err;
    }
    return data;
}
