/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Multi-account isolation checks.
 *
 * Detects potentially unsafe configurations where multiple Feishu accounts
 * belonging to different tenants (different appId) share the default agent
 * without proper isolation via agents + bindings.
 */
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
import type { LarkAccount } from './types';
export type IsolationStatus = 
/** Single account / same appId / no multi-tenant concern */
{
    mode: 'not-applicable';
}
/** All accounts have bindings pointing to different agents */
 | {
    mode: 'isolated';
    accounts: LarkAccount[];
}
/** All accounts have bindings but share the same agent (explicit choice) */
 | {
    mode: 'shared-explicit';
    accounts: LarkAccount[];
    sharedAgentId: string;
}
/** Some or all accounts have no bindings — implicit sharing, risky */
 | {
    mode: 'shared-implicit';
    accounts: LarkAccount[];
    unboundAccounts: LarkAccount[];
};
/**
 * Diagnose whether multiple enabled accounts from different tenants
 * are properly isolated via agent bindings.
 */
export declare function checkMultiAccountIsolation(cfg: ClawdbotConfig): IsolationStatus;
/**
 * Check whether `session.dmScope` is set to per-account isolation.
 *
 * Without this setting, different bots talking to the same user share
 * the same session — even if agent bindings are configured.
 */
export declare function needsDmScopeFix(cfg: ClawdbotConfig): boolean;
/** Return the fix command string, or null if not needed. */
export declare function getDmScopeFixCommand(cfg: ClawdbotConfig): string | null;
/**
 * Generate a combined warning block for doctor / start.
 * Returns null when everything is fine.
 */
export declare function formatIsolationWarning(status: IsolationStatus, cfg?: ClawdbotConfig): string | null;
/**
 * Generate `openclaw config set` commands for per-account isolation.
 */
export declare function generateIsolationFixCommands(cfg: ClawdbotConfig): {
    commands: string[];
    preview: string;
} | null;
/**
 * Generate commands for explicitly sharing the same agent across accounts.
 */
export declare function generateSharedAgentCommands(cfg: ClawdbotConfig): {
    commands: string[];
    preview: string;
} | null;
export declare function collectIsolationWarnings(_cfg: ClawdbotConfig): string[];
export declare function emitSecurityWarnings(_cfg: ClawdbotConfig, _logger: {
    warn?: (msg: string) => void;
    info?: (msg: string) => void;
}): void;
