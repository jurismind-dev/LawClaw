"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Access control policies for the Lark/Feishu channel plugin.
 *
 * Provides allowlist matching, group configuration lookup, tool policy
 * extraction, and group access checks.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveFeishuAllowlistMatch = resolveFeishuAllowlistMatch;
exports.resolveFeishuGroupConfig = resolveFeishuGroupConfig;
exports.resolveFeishuGroupToolPolicy = resolveFeishuGroupToolPolicy;
exports.isFeishuGroupAllowed = isFeishuGroupAllowed;
exports.splitLegacyGroupAllowFrom = splitLegacyGroupAllowFrom;
exports.resolveGroupSenderPolicyContext = resolveGroupSenderPolicyContext;
const accounts_1 = require("../../core/accounts.js");
/**
 * Check whether a sender is permitted by a given allowlist.
 *
 * Entries are normalised to lowercase strings before comparison.
 * A single "*" entry acts as a wildcard that matches everyone.
 * When the allowlist is empty the result is `{ allowed: false }`.
 */
function resolveFeishuAllowlistMatch(params) {
    const allowFrom = params.allowFrom.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean);
    if (allowFrom.length === 0) {
        return { allowed: false };
    }
    // Wildcard: allow everyone
    if (allowFrom.includes('*')) {
        return { allowed: true, matchKey: '*', matchSource: 'wildcard' };
    }
    // Match by sender ID
    const senderId = params.senderId.toLowerCase();
    if (allowFrom.includes(senderId)) {
        return { allowed: true, matchKey: senderId, matchSource: 'id' };
    }
    /*  // Match by sender display name
      const senderName = params.senderName?.toLowerCase();
      if (senderName && allowFrom.includes(senderName)) {
        return { allowed: true, matchKey: senderName, matchSource: 'name' };
      }*/
    return { allowed: false };
}
// ---------------------------------------------------------------------------
// Group configuration lookup
// ---------------------------------------------------------------------------
/**
 * Look up the per-group configuration by group ID.
 *
 * Performs a case-insensitive lookup against the keys in `cfg.groups`.
 * Returns `undefined` when no matching group entry is found.
 */
function resolveFeishuGroupConfig(params) {
    const groups = params.cfg?.groups ?? {};
    const groupId = params.groupId?.trim();
    if (!groupId) {
        return undefined;
    }
    // Direct (exact-key) lookup first
    const direct = groups[groupId];
    if (direct) {
        return direct;
    }
    // Case-insensitive fallback
    const lowered = groupId.toLowerCase();
    const matchKey = Object.keys(groups).find((key) => key.toLowerCase() === lowered);
    return matchKey ? groups[matchKey] : undefined;
}
// ---------------------------------------------------------------------------
// Group tool policy
// ---------------------------------------------------------------------------
/**
 * Extract the tool policy configuration from the group config that
 * corresponds to the given group context.
 *
 * ★ 多账号配置隔离：SDK 回调传入的 params.cfg 是顶层全局配置，
 *   cfg.channels.feishu 不包含 per-account 的覆盖值。
 *   这里通过 getLarkAccount() 获取当前 account 合并后的配置，
 *   确保每个账号的 groups / tool policy 配置独立生效。
 */
function resolveFeishuGroupToolPolicy(params) {
    // 使用 getLarkAccount 获取 per-account 合并后的飞书渠道配置，
    // 而非直接读取 cfg.channels.feishu（顶层全局配置）。
    const account = (0, accounts_1.getLarkAccount)(params.cfg, params.accountId ?? undefined);
    const accountFeishuCfg = account.config;
    if (!accountFeishuCfg) {
        return undefined;
    }
    const groupConfig = resolveFeishuGroupConfig({
        cfg: accountFeishuCfg,
        groupId: params.groupId,
    });
    return groupConfig?.tools;
}
// ---------------------------------------------------------------------------
// Group access gate
// ---------------------------------------------------------------------------
/**
 * Determine whether an inbound group message should be processed.
 *
 * - `disabled` --> always rejected
 * - `open`     --> always allowed
 * - `allowlist` --> allowed only when the sender matches the allowlist
 */
function isFeishuGroupAllowed(params) {
    const { groupPolicy } = params;
    if (groupPolicy === 'disabled') {
        return false;
    }
    if (groupPolicy === 'open') {
        return true;
    }
    // allowlist
    return resolveFeishuAllowlistMatch(params).allowed;
}
// ---------------------------------------------------------------------------
// Legacy compat: groupAllowFrom splitting
// ---------------------------------------------------------------------------
/**
 * Split a raw `groupAllowFrom` array into legacy chat-ID entries
 * (`oc_xxx`) and sender-level entries.
 *
 * Older Feishu configs used `groupAllowFrom` with `oc_xxx` chat IDs to
 * control which groups are allowed.  The correct semantic (aligned with
 * Telegram) is sender IDs.  This function separates the two concerns so
 * both layers can work independently.
 */
function splitLegacyGroupAllowFrom(rawGroupAllowFrom) {
    const legacyChatIds = [];
    const senderAllowFrom = [];
    for (const entry of rawGroupAllowFrom) {
        const str = String(entry);
        if (str.startsWith('oc_')) {
            legacyChatIds.push(str);
        }
        else {
            senderAllowFrom.push(str);
        }
    }
    return { legacyChatIds, senderAllowFrom };
}
// ---------------------------------------------------------------------------
// Sender policy context resolution
// ---------------------------------------------------------------------------
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
function resolveGroupSenderPolicyContext(params) {
    const { groupConfig, defaultConfig, accountFeishuCfg, senderGroupAllowFrom } = params;
    const senderPolicy = groupConfig?.groupPolicy ?? defaultConfig?.groupPolicy ?? accountFeishuCfg?.groupPolicy ?? 'open';
    const senderAllowFrom = [
        ...senderGroupAllowFrom,
        ...(groupConfig?.allowFrom ?? []),
        ...(!groupConfig && defaultConfig?.allowFrom ? defaultConfig.allowFrom : []),
    ];
    return { senderPolicy, senderAllowFrom };
}
