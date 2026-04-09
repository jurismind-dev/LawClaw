"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Permission error extraction and cooldown tracking for Feishu API calls.
 *
 * Extracted from bot.ts: PermissionError type, extractPermissionError,
 * PERMISSION_ERROR_COOLDOWN_MS, permissionErrorNotifiedAt.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.permissionErrorNotifiedAt = exports.PERMISSION_ERROR_COOLDOWN_MS = void 0;
exports.extractPermissionError = extractPermissionError;
const permission_url_1 = require("../../core/permission-url.js");
const auth_errors_1 = require("../../core/auth-errors.js");
// ---------------------------------------------------------------------------
// Permission error extraction
// ---------------------------------------------------------------------------
function extractPermissionError(err) {
    if (!err || typeof err !== 'object') {
        return null;
    }
    const axiosErr = err;
    const data = axiosErr.response?.data;
    if (!data || typeof data !== 'object') {
        return null;
    }
    const feishuErr = data;
    // Feishu permission error code
    if (feishuErr.code !== auth_errors_1.LARK_ERROR.APP_SCOPE_MISSING) {
        return null;
    }
    const msg = feishuErr.msg ?? '';
    const grantUrl = (0, permission_url_1.extractPermissionGrantUrl)(msg);
    if (!grantUrl) {
        return null;
    }
    return { code: feishuErr.code, message: msg, grantUrl };
}
// ---------------------------------------------------------------------------
// Cooldown tracking
// ---------------------------------------------------------------------------
exports.PERMISSION_ERROR_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
exports.permissionErrorNotifiedAt = new Map();
