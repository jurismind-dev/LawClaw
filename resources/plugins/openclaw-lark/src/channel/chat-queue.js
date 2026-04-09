"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Process-level chat task queue.
 *
 * Although located in channel/, this module is intentionally shared
 * across channel, messaging, tools, and card layers as a process-level
 * singleton. Consumers: monitor.ts, dispatch.ts, oauth.ts, auto-auth.ts.
 *
 * Ensures tasks targeting the same account+chat are executed serially.
 * Used by both websocket inbound messages and synthetic message paths.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.threadScopedKey = threadScopedKey;
exports.buildQueueKey = buildQueueKey;
exports.registerActiveDispatcher = registerActiveDispatcher;
exports.unregisterActiveDispatcher = unregisterActiveDispatcher;
exports.getActiveDispatcher = getActiveDispatcher;
exports.hasActiveTask = hasActiveTask;
exports.enqueueFeishuChatTask = enqueueFeishuChatTask;
exports._resetChatQueueState = _resetChatQueueState;
const chatQueues = new Map();
const activeDispatchers = new Map();
/**
 * Append `:thread:{threadId}` suffix when threadId is present.
 * Consistent with the SDK's `:thread:` separator convention.
 */
function threadScopedKey(base, threadId) {
    return threadId ? `${base}:thread:${threadId}` : base;
}
function buildQueueKey(accountId, chatId, threadId) {
    return threadScopedKey(`${accountId}:${chatId}`, threadId);
}
function registerActiveDispatcher(key, entry) {
    activeDispatchers.set(key, entry);
}
function unregisterActiveDispatcher(key) {
    activeDispatchers.delete(key);
}
function getActiveDispatcher(key) {
    return activeDispatchers.get(key);
}
/** Check whether the queue has an active task for the given key. */
function hasActiveTask(key) {
    return chatQueues.has(key);
}
function enqueueFeishuChatTask(params) {
    const { accountId, chatId, threadId, task } = params;
    const key = buildQueueKey(accountId, chatId, threadId);
    const prev = chatQueues.get(key) ?? Promise.resolve();
    const status = chatQueues.has(key) ? 'queued' : 'immediate';
    const taskPromise = prev.then(task, task);
    chatQueues.set(key, taskPromise);
    const cleanup = () => {
        if (chatQueues.get(key) === taskPromise) {
            chatQueues.delete(key);
        }
    };
    taskPromise.then(cleanup, cleanup);
    return { status, promise: taskPromise };
}
/** @internal Test-only: reset all queue and dispatcher state. */
function _resetChatQueueState() {
    chatQueues.clear();
    activeDispatchers.clear();
}
