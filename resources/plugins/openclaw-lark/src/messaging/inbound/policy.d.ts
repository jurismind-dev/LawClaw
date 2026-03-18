/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Access control policies for the Lark/Feishu channel plugin.
 *
 * Provides allowlist matching, group configuration lookup, tool policy
 * extraction, and group access checks.
 */
import type { ChannelGroupContext, GroupToolPolicyConfig } from 'openclaw/plugin-sdk';
import type { FeishuConfig, FeishuGroupConfig } from '../../core/types';
export interface FeishuAllowlistMatch {
    allowed: boolean;
    matchKey?: string;
    matchSource?: 'wildcard' | 'id' | 'name';
}
/**
 * Check whether a sender is permitted by a given allowlist.
 *
 * Entries are normalised to lowercase strings before comparison.
 * A single "*" entry acts as a wildcard that matches everyone.
 * When the allowlist is empty the result is `{ allowed: false }`.
 */
export declare function resolveFeishuAllowlistMatch(params: {
    allowFrom: Array<string | number>;
    senderId: string;
    senderName?: string | null;
}): FeishuAllowlistMatch;
/**
 * Look up the per-group configuration by group ID.
 *
 * Performs a case-insensitive lookup against the keys in `cfg.groups`.
 * Returns `undefined` when no matching group entry is found.
 */
export declare function resolveFeishuGroupConfig(params: {
    cfg?: FeishuConfig;
    groupId?: string | null;
}): FeishuGroupConfig | undefined;
/**
 * Extract the tool policy configuration from the group config that
 * corresponds to the given group context.
 *
 * ★ 多账号配置隔离：SDK 回调传入的 params.cfg 是顶层全局配置，
 *   cfg.channels.feishu 不包含 per-account 的覆盖值。
 *   这里通过 getLarkAccount() 获取当前 account 合并后的配置，
 *   确保每个账号的 groups / tool policy 配置独立生效。
 */
export declare function resolveFeishuGroupToolPolicy(params: ChannelGroupContext): GroupToolPolicyConfig | undefined;
/**
 * Determine whether an inbound group message should be processed.
 *
 * - `disabled` --> always rejected
 * - `open`     --> always allowed
 * - `allowlist` --> allowed only when the sender matches the allowlist
 */
export declare function isFeishuGroupAllowed(params: {
    groupPolicy: 'open' | 'allowlist' | 'disabled';
    allowFrom: Array<string | number>;
    senderId: string;
    senderName?: string | null;
}): boolean;
/**
 * Split a raw `groupAllowFrom` array into legacy chat-ID entries
 * (`oc_xxx`) and sender-level entries.
 *
 * Older Feishu configs used `groupAllowFrom` with `oc_xxx` chat IDs to
 * control which groups are allowed.  The correct semantic (aligned with
 * Telegram) is sender IDs.  This function separates the two concerns so
 * both layers can work independently.
 */
export declare function splitLegacyGroupAllowFrom(rawGroupAllowFrom: Array<string | number>): {
    legacyChatIds: string[];
    senderAllowFrom: string[];
};
/**
 * Resolve the effective sender-level group policy and the merged
 * `allowFrom` list for sender filtering within a group.
 *
 * The precedence chain for `senderPolicy` is:
 *   per-group `groupPolicy` > default ("*") group `groupPolicy` >
 *   global `groupPolicy` > "open" (default).
 *
 * The `senderAllowFrom` is the union of global (non-oc_) entries,
 * per-group entries, and default ("*") entries (when no per-group config).
 */
export declare function resolveGroupSenderPolicyContext(params: {
    groupConfig?: FeishuGroupConfig;
    defaultConfig?: FeishuGroupConfig;
    accountFeishuCfg?: FeishuConfig;
    senderGroupAllowFrom: Array<string | number>;
}): {
    senderPolicy: 'open' | 'allowlist' | 'disabled';
    senderAllowFrom: Array<string | number>;
};
