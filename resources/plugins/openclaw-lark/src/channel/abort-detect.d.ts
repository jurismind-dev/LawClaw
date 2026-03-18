/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Abort trigger detection for the Lark/Feishu channel plugin.
 *
 * Provides a fast-path check to determine whether an inbound message is
 * an abort/stop command *before* it enters the per-chat serial queue.
 *
 * The trigger word list and normalisation logic are copied from the
 * OpenClaw core (`src/auto-reply/reply/abort.ts`) so the plugin can
 * make a lightweight decision without importing the full reply pipeline.
 * The message still flows through `tryFastAbortFromMessage()` for
 * authoritative handling.
 */
import type { FeishuMessageEvent } from '../messaging/types';
/** Exact trigger-word match (same logic as OpenClaw core `isAbortTrigger`). */
export declare function isAbortTrigger(text: string): boolean;
/**
 * Extended abort detection: matches both bare trigger words and the
 * `/stop` command form.  Used by the monitor fast-path.
 */
export declare function isLikelyAbortText(text: string): boolean;
/**
 * Extract the raw text payload from a Feishu message event.
 *
 * Only handles `text` type messages.  The `message.content` field is a
 * JSON string like `{"text":"hello"}`.  Returns `undefined` for
 * non-text messages or parse failures.
 *
 * In group chats, bot mention placeholders (`@_user_N`) are stripped so
 * a message like `@Bot stop` is detected as `stop`.
 */
export declare function extractRawTextFromEvent(event: FeishuMessageEvent): string | undefined;
