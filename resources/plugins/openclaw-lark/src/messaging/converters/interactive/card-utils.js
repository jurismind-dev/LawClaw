"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Utility functions for card content conversion.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeAttr = escapeAttr;
exports.formatMillisecondsToISO8601 = formatMillisecondsToISO8601;
exports.normalizeTimeFormat = normalizeTimeFormat;
function escapeAttr(s) {
    return s.replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
function formatMillisecondsToISO8601(milliseconds) {
    const ms = parseInt(milliseconds, 10);
    if (isNaN(ms))
        return '';
    return new Date(ms).toISOString();
}
function normalizeTimeFormat(input) {
    if (!input)
        return '';
    const num = parseInt(input, 10);
    if (!isNaN(num) && String(num) === input.trim()) {
        if (input.length >= 13) {
            return new Date(num).toISOString();
        }
        else if (input.length >= 10) {
            return new Date(num * 1000).toISOString();
        }
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(input)) {
        return input;
    }
    const dtMatch = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)$/.exec(input);
    if (dtMatch) {
        const d = new Date(`${dtMatch[1]}T${dtMatch[2]}`);
        if (!isNaN(d.getTime()))
            return d.toISOString();
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(input))
        return input;
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(input))
        return input;
    return input;
}
