"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Feishu Drive comment target ID parsing and formatting utilities.
 *
 * Comment targets use one of these formats:
 * - `comment:<fileType>:<fileToken>:<commentId>` (legacy/default reply mode)
 * - `comment:<deliveryMode>:<fileType>:<fileToken>:<commentId>`
 *
 * This enables the outbound routing layer to distinguish comment-thread
 * replies from normal IM messages and route them through the Drive
 * comment API instead.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFeishuCommentTarget = buildFeishuCommentTarget;
exports.parseFeishuCommentTarget = parseFeishuCommentTarget;
exports.isCommentTarget = isCommentTarget;
const VALID_FILE_TYPES = new Set(['doc', 'docx', 'file', 'sheet', 'slides']);
const VALID_DELIVERY_MODES = new Set(['reply', 'create_whole']);
const COMMENT_PREFIX = 'comment:';
// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
/**
 * Construct a comment target string from its components.
 *
 * @example
 * ```ts
 * buildFeishuCommentTarget({ fileType: 'docx', fileToken: 'abc123', commentId: '789' })
 * // => 'comment:docx:abc123:789'
 *
 * buildFeishuCommentTarget({ deliveryMode: 'create_whole', fileType: 'docx', fileToken: 'abc123', commentId: '789' })
 * // => 'comment:create_whole:docx:abc123:789'
 * ```
 */
function buildFeishuCommentTarget(params) {
    const deliveryMode = params.deliveryMode ?? 'reply';
    if (deliveryMode === 'reply') {
        return `${COMMENT_PREFIX}${params.fileType}:${params.fileToken}:${params.commentId}`;
    }
    return `${COMMENT_PREFIX}${deliveryMode}:${params.fileType}:${params.fileToken}:${params.commentId}`;
}
// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------
/**
 * Parse a comment target string into its components.
 *
 * Returns `null` when the string is not a valid comment target.
 *
 * @example
 * ```ts
 * parseFeishuCommentTarget('comment:docx:abc123:789')
 * // => { deliveryMode: 'reply', fileType: 'docx', fileToken: 'abc123', commentId: '789' }
 *
 * parseFeishuCommentTarget('comment:create_whole:docx:abc123:789')
 * // => { deliveryMode: 'create_whole', fileType: 'docx', fileToken: 'abc123', commentId: '789' }
 *
 * parseFeishuCommentTarget('oc_xxx')
 * // => null
 * ```
 */
function parseFeishuCommentTarget(target) {
    if (!target || !target.startsWith(COMMENT_PREFIX))
        return null;
    const rest = target.slice(COMMENT_PREFIX.length);
    const parts = rest.split(':');
    let deliveryMode = 'reply';
    let fileType;
    let fileToken;
    let commentId;
    if (parts.length === 3) {
        [fileType, fileToken, commentId] = parts;
    }
    else if (parts.length === 4 && VALID_DELIVERY_MODES.has(parts[0])) {
        [deliveryMode, fileType, fileToken, commentId] = parts;
    }
    else {
        return null;
    }
    if (!VALID_FILE_TYPES.has(fileType) || !fileToken || !commentId)
        return null;
    return {
        deliveryMode,
        fileType: fileType,
        fileToken,
        commentId,
    };
}
// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------
/**
 * Return `true` when a target string looks like a comment target.
 */
function isCommentTarget(target) {
    return Boolean(target && target.startsWith(COMMENT_PREFIX));
}
