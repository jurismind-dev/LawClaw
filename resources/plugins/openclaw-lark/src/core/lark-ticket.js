"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Request-level ticket for the Feishu plugin.
 *
 * Uses Node.js AsyncLocalStorage to propagate a ticket (message_id,
 * chat_id, account_id) through the entire async call chain without passing
 * parameters explicitly.  Call {@link withTicket} at the event entry point
 * (monitor.ts) and use {@link getTicket} anywhere downstream.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.withTicket = withTicket;
exports.getTicket = getTicket;
exports.ticketElapsed = ticketElapsed;
const node_async_hooks_1 = require("node:async_hooks");
// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
const store = new node_async_hooks_1.AsyncLocalStorage();
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Run `fn` within a ticket context.  All async operations spawned inside
 * `fn` will inherit the context and can access it via {@link getTicket}.
 */
function withTicket(ticket, fn) {
    return store.run(ticket, fn);
}
/** Return the current ticket, or `undefined` if not inside withTicket. */
function getTicket() {
    return store.getStore();
}
/** Milliseconds elapsed since the current ticket was created, or 0. */
function ticketElapsed() {
    const t = store.getStore();
    return t ? Date.now() - t.startTime : 0;
}
