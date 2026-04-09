"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Shared registry for the inbound message handler.
 *
 * Synthetic message helpers depend on this registry instead of importing
 * `handler.ts` directly, which keeps the static import graph acyclic.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.injectInboundHandler = injectInboundHandler;
exports.getInboundHandler = getInboundHandler;
let inboundHandler = null;
function injectInboundHandler(handler) {
    inboundHandler = handler;
}
function getInboundHandler() {
    if (!inboundHandler) {
        throw new Error('Feishu inbound handler has not been initialised.');
    }
    return inboundHandler;
}
