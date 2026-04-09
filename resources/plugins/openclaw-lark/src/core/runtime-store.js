"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Shared runtime store for the Feishu plugin.
 *
 * Allows modules such as the logger to access the plugin runtime without
 * importing LarkClient directly, which would otherwise create static cycles.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setLarkRuntime = setLarkRuntime;
exports.tryGetLarkRuntime = tryGetLarkRuntime;
exports.getLarkRuntime = getLarkRuntime;
const RUNTIME_NOT_INITIALIZED_ERROR = 'Feishu plugin runtime has not been initialised. ' +
    'Ensure LarkClient.setRuntime() is called during plugin activation.';
let runtime = null;
function setLarkRuntime(nextRuntime) {
    runtime = nextRuntime;
}
function tryGetLarkRuntime() {
    return runtime;
}
function getLarkRuntime() {
    if (!runtime) {
        throw new Error(RUNTIME_NOT_INITIALIZED_ERROR);
    }
    return runtime;
}
