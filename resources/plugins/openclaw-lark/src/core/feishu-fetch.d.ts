/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Header-aware fetch for Feishu API calls.
 *
 * Drop-in replacement for `fetch()` that automatically injects
 * the User-Agent header.
 */
/**
 * Drop-in replacement for `fetch()` that automatically injects
 * the User-Agent header.
 *
 * Used by `device-flow.ts` and `uat-client.ts` so that the custom
 * User-Agent is transparently applied without changing every
 * call-site's signature.
 */
export declare function feishuFetch(url: string | URL | Request, init?: RequestInit): Promise<Response>;
