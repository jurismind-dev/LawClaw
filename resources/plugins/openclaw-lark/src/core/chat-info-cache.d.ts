/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Account-scoped LRU cache for Feishu group/chat metadata.
 *
 * Caches the result of `im.chat.get` (chat_mode, group_message_type, etc.)
 * to avoid repeated OAPI calls for every inbound message.
 *
 * Key fields cached:
 * - `chat_mode`: "group" | "topic" | "p2p"
 * - `group_message_type`: "chat" | "thread" (only for chat_mode=group)
 */
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
export interface ChatInfo {
    chatMode: 'group' | 'topic' | 'p2p';
    groupMessageType?: 'chat' | 'thread';
}
/** Clear chat-info caches (called from LarkClient.clearCache). */
export declare function clearChatInfoCache(accountId?: string): void;
/**
 * Determine whether a group supports thread sessions.
 *
 * Returns `true` when the group is a topic group (`chat_mode=topic`) or
 * a normal group with thread message mode (`group_message_type=thread`).
 *
 * Results are cached per-account with a 1-hour TTL to minimise OAPI calls.
 */
export declare function isThreadCapableGroup(params: {
    cfg: ClawdbotConfig;
    chatId: string;
    accountId?: string;
}): Promise<boolean>;
/**
 * Fetch (or read from cache) the chat metadata for a given chat ID.
 *
 * Returns `undefined` when the API call fails (best-effort).
 */
export declare function getChatInfo(params: {
    cfg: ClawdbotConfig;
    chatId: string;
    accountId?: string;
}): Promise<ChatInfo | undefined>;
/**
 * Determine the chat type (p2p or group) for a given chat ID.
 *
 * Delegates to the shared {@link getChatInfo} cache (account-scoped LRU with
 * 1-hour TTL) so that chat metadata is fetched at most once across all
 * call-sites (dispatch, reaction handler, etc.).
 *
 * Falls back to "p2p" if the API call fails.
 */
export declare function getChatTypeFeishu(params: {
    cfg: ClawdbotConfig;
    chatId: string;
    accountId?: string;
}): Promise<'p2p' | 'group'>;
