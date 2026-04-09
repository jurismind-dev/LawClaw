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
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
import type { ConfiguredLarkAccount, FeishuConfig, LarkAccount, LarkCredentials } from './types';
/**
 * List all account IDs defined in the Lark config.
 *
 * Returns `[DEFAULT_ACCOUNT_ID]` when no explicit accounts exist.
 */
export declare function getLarkAccountIds(cfg: ClawdbotConfig): string[];
/** Return the first (default) account ID. */
export declare function getDefaultLarkAccountId(cfg: ClawdbotConfig): string;
/**
 * Resolve a single account by merging the top-level config with
 * account-level overrides.  Account fields take precedence.
 *
 * Falls back to the default account when `accountId` is omitted or `null`.
 */
export declare function getLarkAccount(cfg: ClawdbotConfig, accountId?: string | null): LarkAccount;
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
export declare function createAccountScopedConfig(cfg: ClawdbotConfig, accountId?: string | null): ClawdbotConfig;
/** Return all accounts that are both configured and enabled. */
export declare function getEnabledLarkAccounts(cfg: ClawdbotConfig): LarkAccount[];
/**
 * Extract API credentials from a Feishu config fragment.
 *
 * Returns `null` when `appId` or `appSecret` is missing.
 */
export declare function getLarkCredentials(feishuCfg?: FeishuConfig): LarkCredentials | null;
/** Type guard: narrow `LarkAccount` to `ConfiguredLarkAccount`. */
export declare function isConfigured(account: LarkAccount): account is ConfiguredLarkAccount;
