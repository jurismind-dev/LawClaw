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
/** Document types that support Drive comments. */
export type CommentFileType = 'doc' | 'docx' | 'file' | 'sheet' | 'slides';
/** Delivery mode for a comment target. */
export type CommentDeliveryMode = 'reply' | 'create_whole';
/** Parsed comment target components. */
export interface CommentTarget {
    deliveryMode: CommentDeliveryMode;
    fileType: CommentFileType;
    fileToken: string;
    commentId: string;
}
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
export declare function buildFeishuCommentTarget(params: {
    deliveryMode?: CommentDeliveryMode;
    fileType: CommentFileType;
    fileToken: string;
    commentId: string;
}): string;
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
export declare function parseFeishuCommentTarget(target: string): CommentTarget | null;
/**
 * Return `true` when a target string looks like a comment target.
 */
export declare function isCommentTarget(target: string): boolean;
