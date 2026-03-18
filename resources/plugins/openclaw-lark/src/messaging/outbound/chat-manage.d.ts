/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Chat management for the Lark/Feishu channel plugin.
 *
 * Provides functions to update chat settings (name, avatar), manage
 * members (add, remove, list) using the IM Chat API.
 */
import type { OpenClawConfig } from 'openclaw/plugin-sdk';
export interface FeishuChatMember {
    /** Member ID (open_id by default). */
    memberId: string;
    /** Display name of the member. */
    name: string;
    /** ID type: "open_id", "union_id", or "user_id". */
    memberIdType: string;
}
/**
 * Update chat settings such as name or avatar.
 */
export declare function updateChatFeishu(params: {
    cfg: OpenClawConfig;
    chatId: string;
    name?: string;
    avatar?: string;
    accountId?: string;
}): Promise<void>;
/**
 * Add members to a chat by their open_id list.
 */
export declare function addChatMembersFeishu(params: {
    cfg: OpenClawConfig;
    chatId: string;
    memberIds: string[];
    accountId?: string;
}): Promise<void>;
/**
 * Remove members from a chat by their open_id list.
 */
export declare function removeChatMembersFeishu(params: {
    cfg: OpenClawConfig;
    chatId: string;
    memberIds: string[];
    accountId?: string;
}): Promise<void>;
/**
 * List members of a chat.
 *
 * Returns a single page (up to 100 members) to avoid unnecessary data
 * overhead for large groups.  Use the returned `pageToken` to fetch
 * subsequent pages when needed.
 */
export declare function listChatMembersFeishu(params: {
    cfg: OpenClawConfig;
    chatId: string;
    accountId?: string;
    /** Optional page token for pagination. */
    pageToken?: string;
}): Promise<{
    members: FeishuChatMember[];
    pageToken?: string;
    hasMore: boolean;
}>;
