"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Lark multi-account management.
 *
 * Account overrides live under `cfg.channels.feishu.accounts`.
 * Each account may override any top-level Feishu config field;
 * unset fields fall back to the top-level defaults.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLarkAccountIds = getLarkAccountIds;
exports.getDefaultLarkAccountId = getDefaultLarkAccountId;
exports.getLarkAccount = getLarkAccount;
exports.createAccountScopedConfig = createAccountScopedConfig;
exports.getEnabledLarkAccounts = getEnabledLarkAccounts;
exports.getLarkCredentials = getLarkCredentials;
exports.isConfigured = isConfigured;
const account_id_1 = require("openclaw/plugin-sdk/account-id");
const normalizeAccountId = typeof account_id_1.normalizeAccountId === 'function'
    ? account_id_1.normalizeAccountId
    : (id) => id?.trim().toLowerCase() || undefined;
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/** Extract the `channels.feishu` section from the top-level config. */
function getLarkConfig(cfg) {
    return cfg?.channels?.feishu;
}
/** Return the per-account override map, if present. */
function getAccountMap(section) {
    return section.accounts;
}
/** Strip the `accounts` key and return the remaining top-level config. */
function baseConfig(section) {
    const { accounts: _ignored, ...rest } = section;
    return rest;
}
/** Merge base config with account override (account fields take precedence).
 *  Performs a one-level deep merge for plain-object fields so that partial
 *  account overrides (e.g. `footer: { model: false }`) are merged with
 *  the base instead of replacing the entire object. */
function mergeAccountConfig(base, override) {
    const result = { ...base };
    for (const [key, value] of Object.entries(override)) {
        if (value === undefined)
            continue;
        const baseVal = base[key];
        // Deep-merge plain objects one level (footer, tools, heartbeat, etc.)
        if (value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            baseVal &&
            typeof baseVal === 'object' &&
            !Array.isArray(baseVal)) {
            result[key] = { ...baseVal, ...value };
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
/** Coerce a domain string to `LarkBrand`, defaulting to `"feishu"`. */
function toBrand(domain) {
    return domain ?? 'feishu';
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * List all account IDs defined in the Lark config.
 *
 * Returns `[DEFAULT_ACCOUNT_ID]` when no explicit accounts exist.
 */
function getLarkAccountIds(cfg) {
    const section = getLarkConfig(cfg);
    if (!section)
        return [account_id_1.DEFAULT_ACCOUNT_ID];
    const accountMap = getAccountMap(section);
    if (!accountMap || Object.keys(accountMap).length === 0) {
        return [account_id_1.DEFAULT_ACCOUNT_ID];
    }
    const accountIds = Object.keys(accountMap);
    // 当 accounts 存在时，如果顶层也配置了 appId/appSecret（即默认机器人），
    // 将 DEFAULT_ACCOUNT_ID 加入列表，确保顶层机器人不会被忽略。
    // 但如果 accountMap 已经包含 default，则不重复添加。
    const hasDefault = accountIds.some((id) => id.trim().toLowerCase() === account_id_1.DEFAULT_ACCOUNT_ID);
    if (!hasDefault) {
        const base = baseConfig(section);
        if (base.appId && base.appSecret) {
            return [account_id_1.DEFAULT_ACCOUNT_ID, ...accountIds];
        }
    }
    return accountIds;
}
/** Return the first (default) account ID. */
function getDefaultLarkAccountId(cfg) {
    return getLarkAccountIds(cfg)[0];
}
/**
 * Resolve a single account by merging the top-level config with
 * account-level overrides.  Account fields take precedence.
 *
 * Falls back to the default account when `accountId` is omitted or `null`.
 */
function getLarkAccount(cfg, accountId) {
    const requestedId = accountId ? (normalizeAccountId(accountId) ?? account_id_1.DEFAULT_ACCOUNT_ID) : account_id_1.DEFAULT_ACCOUNT_ID;
    const section = getLarkConfig(cfg);
    if (!section) {
        return {
            accountId: requestedId,
            enabled: false,
            configured: false,
            brand: 'feishu',
            config: {},
        };
    }
    const base = baseConfig(section);
    const accountMap = getAccountMap(section);
    const accountOverride = accountMap && requestedId !== account_id_1.DEFAULT_ACCOUNT_ID
        ? accountMap[requestedId]
        : undefined;
    const merged = accountOverride
        ? mergeAccountConfig(base, accountOverride)
        : { ...base };
    const appId = merged.appId;
    const appSecret = merged.appSecret;
    const configured = !!(appId && appSecret);
    // Respect explicit `enabled` when set; otherwise derive from `configured`.
    const enabled = !!(merged.enabled ?? configured);
    const brand = toBrand(merged.domain);
    if (configured) {
        return {
            accountId: requestedId,
            enabled,
            configured: true,
            name: merged.name ?? undefined,
            appId: appId,
            appSecret: appSecret,
            encryptKey: merged.encryptKey ?? undefined,
            verificationToken: merged.verificationToken ?? undefined,
            brand,
            config: merged,
        };
    }
    return {
        accountId: requestedId,
        enabled,
        configured: false,
        name: merged.name ?? undefined,
        appId: appId ?? undefined,
        appSecret: appSecret ?? undefined,
        encryptKey: merged.encryptKey ?? undefined,
        verificationToken: merged.verificationToken ?? undefined,
        brand,
        config: merged,
    };
}
/**
 * Build an account-scoped config view for downstream helpers that read from
 * `cfg.channels.feishu`.
 *
 * In multi-account mode, many runtime helpers expect the merged account config
 * to already be exposed at `cfg.channels.feishu`. This mirrors the inbound
 * path behavior so outbound/tooling code resolves per-account settings
 * consistently.
 *
 * @param cfg - Original top-level plugin config
 * @param accountId - Optional target account ID
 * @returns Config with `channels.feishu` replaced by the merged account config
 */
function createAccountScopedConfig(cfg, accountId) {
    const account = getLarkAccount(cfg, accountId);
    return {
        ...cfg,
        channels: {
            ...cfg.channels,
            feishu: account.config,
        },
    };
}
/** Return all accounts that are both configured and enabled. */
function getEnabledLarkAccounts(cfg) {
    const ids = getLarkAccountIds(cfg);
    const results = [];
    for (const id of ids) {
        const account = getLarkAccount(cfg, id);
        if (account.enabled && account.configured) {
            results.push(account);
        }
    }
    return results;
}
/**
 * Extract API credentials from a Feishu config fragment.
 *
 * Returns `null` when `appId` or `appSecret` is missing.
 */
function getLarkCredentials(feishuCfg) {
    if (!feishuCfg)
        return null;
    const appId = feishuCfg.appId;
    const appSecret = feishuCfg.appSecret;
    if (!appId || !appSecret)
        return null;
    return {
        appId,
        appSecret,
        encryptKey: feishuCfg.encryptKey ?? undefined,
        verificationToken: feishuCfg.verificationToken ?? undefined,
        brand: toBrand(feishuCfg.domain),
    };
}
/** Type guard: narrow `LarkAccount` to `ConfiguredLarkAccount`. */
function isConfigured(account) {
    return account.configured;
}
