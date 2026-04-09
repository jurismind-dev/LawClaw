/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Directory listing for Feishu peers (users) and groups.
 *
 * Provides both config-based (offline) and live API directory
 * lookups so the outbound subsystem and UI can resolve targets.
 */
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
import type { FeishuDirectoryGroup, FeishuDirectoryPeer } from './types';
export type { FeishuDirectoryPeer, FeishuDirectoryGroup } from './types';
/**
 * List users known from the channel config (allowFrom + dms fields).
 *
 * Does not make any API calls -- useful when the bot is not yet
 * connected or when credentials are unavailable.
 */
export declare function listFeishuDirectoryPeers(params: {
    cfg: ClawdbotConfig;
    query?: string;
    limit?: number;
    accountId?: string;
}): Promise<FeishuDirectoryPeer[]>;
/**
 * List groups known from the channel config (groups + groupAllowFrom).
 */
export declare function listFeishuDirectoryGroups(params: {
    cfg: ClawdbotConfig;
    query?: string;
    limit?: number;
    accountId?: string;
}): Promise<FeishuDirectoryGroup[]>;
/**
 * List users via the Feishu contact/v3/users API.
 *
 * Falls back to config-based listing when credentials are missing or
 * the API call fails.
 */
export declare function listFeishuDirectoryPeersLive(params: {
    cfg: ClawdbotConfig;
    query?: string;
    limit?: number;
    accountId?: string;
}): Promise<FeishuDirectoryPeer[]>;
/**
 * List groups via the Feishu im/v1/chats API.
 *
 * Falls back to config-based listing when credentials are missing or
 * the API call fails.
 */
export declare function listFeishuDirectoryGroupsLive(params: {
    cfg: ClawdbotConfig;
    query?: string;
    limit?: number;
    accountId?: string;
}): Promise<FeishuDirectoryGroup[]>;
