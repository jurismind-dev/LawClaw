"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Local shim for readReactionParams whose SDK signature changed in
 * 2026.3.14 (now requires a channel-specific config object).
 * Re-exports jsonResult from the SDK directly.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsonResult = void 0;
exports.readReactionParams = readReactionParams;
var agent_runtime_1 = require("openclaw/plugin-sdk/agent-runtime");
Object.defineProperty(exports, "jsonResult", { enumerable: true, get: function () { return agent_runtime_1.jsonResult; } });
/**
 * Extract reaction parameters from raw action params.
 * Returns emoji, remove flag, and isEmpty indicator.
 */
function readReactionParams(params, opts) {
    const raw = params.emoji ?? params.reaction ?? params.type;
    const emoji = typeof raw === 'string' ? raw.trim() : '';
    const remove = Boolean(params.remove ?? params.unreact);
    const isEmpty = !emoji && !remove;
    if (remove && !emoji && opts?.removeErrorMessage) {
        throw new Error(opts.removeErrorMessage);
    }
    return { emoji, remove, isEmpty };
}
