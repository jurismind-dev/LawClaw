/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Drive comment event context resolution.
 *
 * Resolves the full context for a `drive.notice.comment_add_v1` event:
 * document title, comment quoted text, and reply chain.
 */
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
import type { FeishuDriveCommentEvent } from '../types';
/** Resolved context for a Drive comment event. */
export interface CommentEventTurn {
    /** Document title (best-effort, may be undefined). */
    docTitle?: string;
    /** File type of the document. */
    fileType: string;
    /** File token of the document. */
    fileToken: string;
    /** Root comment ID. */
    commentId: string;
    /** Reply ID (if this event is a reply). */
    replyId?: string;
    /** Quoted text from the comment (the content being commented on). */
    quotedText?: string;
    /** The text of the triggering comment/reply. */
    commentText?: string;
    /** Reply chain context (previous replies in the thread). */
    replyChainContext?: string;
    /** Whether the bot was @-mentioned. */
    isMentioned?: boolean;
    /** Whether the source comment is a whole-document comment. */
    isWholeComment?: boolean;
    /** Surface prompt for the agent (context + instructions). */
    prompt: string;
    /** Short preview of the prompt. */
    preview: string;
}
/**
 * Infer whether a Drive comment thread is a whole-document comment.
 *
 * The explicit `is_whole` flag is authoritative when present. When the API
 * omits it, the root comment's quoted anchor is the best fallback signal:
 * whole-document comments have no quote, while anchored comments do.
 *
 * Note that this inference is about the root thread, so it must behave the
 * same for both root-comment events and reply events.
 */
export declare function inferIsWholeComment(params: {
    explicitIsWhole?: boolean;
    quotedText?: string;
}): boolean;
/**
 * Resolve the full context for a Drive comment event.
 *
 * Fetches document metadata, comment content, and reply chain.
 */
export declare function resolveDriveCommentEventTurn(params: {
    cfg: ClawdbotConfig;
    event: FeishuDriveCommentEvent;
    accountId?: string;
}): Promise<CommentEventTurn | null>;
/**
 * Parse the raw webhook payload for a `drive.notice.comment_add_v1` event.
 *
 * The SDK flattens the v2 envelope, so the event data may be at the
 * top level or nested under `event`. User info and timestamp live inside
 * `notice_meta` in the real event structure, with fallback to top-level
 * fields for compatibility with different SDK flattening styles.
 */
/**
 * Normalize a Drive comment event into a canonical shape.
 *
 * Real event structures vary:
 *   - **notice_meta style**: file_token, file_type, from_user_id, timestamp
 *     all live inside `notice_meta`; top-level only has comment_id/reply_id.
 *   - **SDK-flattened style**: fields may be hoisted to top level.
 *
 * This parser checks `notice_meta.*` first, then falls back to top-level
 * fields, so the handler can consume a single canonical shape.
 */
export declare function parseFeishuDriveCommentNoticeEventPayload(data: unknown): FeishuDriveCommentEvent | null;
