"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Shared utilities for the reasoning display subsystem.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeToolName = normalizeToolName;
exports.truncateText = truncateText;
exports.redactInlineSecrets = redactInlineSecrets;
exports.sanitizeParamsForLog = sanitizeParamsForLog;
function normalizeToolName(name) {
    return name?.trim().toLowerCase() ?? '';
}
function truncateText(value, maxLength) {
    if (value.length <= maxLength)
        return value;
    return `${value.slice(0, maxLength - 3)}...`;
}
const INLINE_ASSIGNMENT_RE = /(^|[\s"'`])([A-Za-z_][A-Za-z0-9_]*)(=(?:"[^"]*"|'[^']*'|[^\s"'`]+))/g;
const AUTH_HEADER_SECRET_RE = /(Authorization\s*:\s*(?:Bearer|Basic|Token)\s+)([^'"\s]+)/gi;
const QUOTED_HEADER_ARG_RE = /((?:^|[\s"'`])(?:-H|--header)\s+)(['"])([A-Za-z0-9_-]+)(\s*:\s*)([^'"]*)(\2)/gi;
const UNQUOTED_HEADER_ARG_RE = /((?:^|[\s"'`])(?:-H|--header)\s+)([A-Za-z0-9_-]+)(\s*:\s*)([^\s"'`]+)/gi;
const SECRET_FLAG_RE = /((?:^|[\s"'`]))(--?[A-Za-z0-9][A-Za-z0-9-]*)(=|\s+)(?:"([^"]*)"|'([^']*)'|([^\s"'`]+))/g;
const SENSITIVE_NAME_RE = /token|secret|password|api[_-]?key|authorization|cookie|credential|bearer|session[_-]?id|client[_-]?secret|access[_-]?key/i;
function redactInlineSecrets(value) {
    return value
        .replace(INLINE_ASSIGNMENT_RE, (match, prefix, key) => isSensitiveName(key) ? `${prefix}${key}=[redacted]` : match)
        .replace(AUTH_HEADER_SECRET_RE, '$1[redacted]')
        .replace(QUOTED_HEADER_ARG_RE, (match, prefix, quote, name, separator) => shouldRedactHeaderValue(name) ? `${prefix}${quote}${name}${separator}[redacted]${quote}` : match)
        .replace(UNQUOTED_HEADER_ARG_RE, (match, prefix, name, separator) => shouldRedactHeaderValue(name) ? `${prefix}${name}${separator}[redacted]` : match)
        .replace(SECRET_FLAG_RE, (match, prefix, flag, separator, doubleQuoted, singleQuoted, bare) => {
        const normalizedFlag = flag.replace(/^-+/, '');
        if (!isSensitiveName(normalizedFlag))
            return match;
        const redactedValue = doubleQuoted !== undefined
            ? '"[redacted]"'
            : singleQuoted !== undefined
                ? "'[redacted]'"
                : bare !== undefined
                    ? '[redacted]'
                    : '[redacted]';
        return `${prefix}${flag}${separator}${redactedValue}`;
    });
}
function isSensitiveName(value) {
    return SENSITIVE_NAME_RE.test(value);
}
function shouldRedactHeaderValue(name) {
    return !/^authorization$/i.test(name) && isSensitiveName(name);
}
/**
 * Sanitize tool params for safe logging.
 * Logs only param key names (no values) to avoid leaking sensitive data.
 */
function sanitizeParamsForLog(params) {
    if (!params || typeof params !== 'object')
        return '';
    const keys = Object.keys(params);
    if (keys.length === 0)
        return '{}';
    return `{${keys.join(',')}}`;
}
