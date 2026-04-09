"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Header-aware fetch for Feishu API calls.
 *
 * Drop-in replacement for `fetch()` that automatically injects
 * the User-Agent header.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.feishuFetch = feishuFetch;
const version_1 = require("./version.js");
/**
 * Drop-in replacement for `fetch()` that automatically injects
 * the User-Agent header.
 *
 * Used by `device-flow.ts` and `uat-client.ts` so that the custom
 * User-Agent is transparently applied without changing every
 * call-site's signature.
 */
function feishuFetch(url, init) {
    const headers = {
        ...init?.headers,
        'User-Agent': (0, version_1.getUserAgent)(),
    };
    return fetch(url, { ...init, headers });
}
