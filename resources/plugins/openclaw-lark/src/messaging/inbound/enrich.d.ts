/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Context enrichment for inbound Feishu messages.
 *
 * Enrichment phases:
 *
 * - **resolveSenderInfo** (lightweight, before gate) — resolves sender
 *   display name and tracks permission errors.
 * - **prefetchUserNames** (after gate, before content resolution) — batch
 *   pre-warm the account-scoped user-name cache for the sender and all
 *   non-bot mentions so that downstream merge_forward expansion and
 *   quoted-message formatting can read names synchronously.
 * - **resolveMedia** (after gate) — downloads binary media attachments
 *   using ResourceDescriptors from the converter phase.
 * - **resolveQuotedContent** (after gate) — fetches the replied-to
 *   message text for context.
 *
 * Note: merge_forward expansion for the primary message is now handled
 * at parse time in {@link parseMessageEvent}. Quoted merge_forward
 * messages are still expanded here via {@link resolveQuotedContent}.
 */
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
import type { FeishuMediaInfo, MessageContext } from '../types';
import type { LarkAccount } from '../../core/types';
import type { PermissionError } from './permission';
/**
 * Resolve the sender display name and track permission errors.
 *
 * This must run before the gate check because per-group sender
 * allowlists may match on senderName.
 */
export declare function resolveSenderInfo(params: {
    ctx: MessageContext;
    account: LarkAccount;
    log: (...args: unknown[]) => void;
}): Promise<{
    ctx: MessageContext;
    permissionError?: PermissionError;
}>;
/**
 * Batch-prefetch user display names for the sender and all non-bot
 * mentions. Mention names that are already known from the event payload
 * are written into the cache for free.
 */
export declare function prefetchUserNames(params: {
    ctx: MessageContext;
    account: LarkAccount;
    log: (...args: unknown[]) => void;
}): Promise<void>;
/** Result of media resolution: envelope payload + per-file mapping. */
export interface ResolveMediaResult {
    payload: Record<string, unknown>;
    mediaList: FeishuMediaInfo[];
}
/**
 * Download and save binary media attachments (images, files, audio,
 * video, stickers) from the inbound message.
 *
 * Uses ResourceDescriptors extracted by content converters during the
 * parse phase — no re-parsing of rawMessage.content needed.
 *
 * Returns a payload object whose keys (`MediaPath`, `MediaType`, …)
 * are spread directly into the agent envelope, plus the raw mediaList
 * for content substitution.
 */
export declare function resolveMedia(params: {
    ctx: MessageContext;
    /** account 级别的 ClawdbotConfig（channels.feishu 已替换为 per-account 合并后的配置） */
    accountScopedCfg: ClawdbotConfig;
    account: LarkAccount;
    log: (...args: unknown[]) => void;
}): Promise<ResolveMediaResult>;
/**
 * Replace Feishu file-key references in message content with actual
 * local file paths after download.
 *
 * This is critical for:
 * - **Images / stickers**: The SDK's `detectAndLoadPromptImages` scans
 *   the prompt text for local file paths with image extensions.
 * - **Audio / video / files**: Gives the AI meaningful context about
 *   what was received (the SDK reads these via `MediaPath` directly,
 *   but the text body should still reflect the actual attachments).
 */
export declare function substituteMediaPaths(content: string, mediaList: FeishuMediaInfo[]): string;
/**
 * Fetch the text content of the message that the user replied to.
 *
 * If the quoted message is itself a merge_forward, its sub-messages are
 * fetched and formatted as a single text block.
 *
 * Returns `"senderName: content"` when the sender name is available so
 * the AI knows who originally wrote the quoted message.
 */
export declare function resolveQuotedContent(params: {
    ctx: MessageContext;
    /** account 级别的 ClawdbotConfig（channels.feishu 已替换为 per-account 合并后的配置） */
    accountScopedCfg: ClawdbotConfig;
    account: LarkAccount;
    log: (...args: unknown[]) => void;
}): Promise<string | undefined>;
