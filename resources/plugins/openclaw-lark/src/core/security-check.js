"use strict";
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
import { getEnabledLarkAccounts } from './accounts';
// ---------------------------------------------------------------------------
// Check logic
// ---------------------------------------------------------------------------
/**
 * Diagnose whether multiple enabled accounts from different tenants
 * are properly isolated via agent bindings.
 */
export function checkMultiAccountIsolation(cfg) {
    const accounts = getEnabledLarkAccounts(cfg);
    if (accounts.length <= 1)
        return { mode: 'not-applicable' };
    const appIds = new Set(accounts.map((a) => (a.configured ? a.appId : undefined)).filter((id) => !!id));
    if (appIds.size <= 1)
        return { mode: 'not-applicable' };
    const feishuBindings = cfg.bindings?.filter((b) => b.match?.channel === 'feishu' && b.match?.accountId);
    if (!feishuBindings || feishuBindings.length === 0) {
        return { mode: 'shared-implicit', accounts, unboundAccounts: accounts };
    }
    const boundAccountIds = new Set(feishuBindings.map((b) => b.match.accountId));
    const unboundAccounts = accounts.filter((a) => !boundAccountIds.has(a.accountId));
    if (unboundAccounts.length > 0) {
        return { mode: 'shared-implicit', accounts, unboundAccounts };
    }
    const agentIds = new Set(feishuBindings.map((b) => b.agentId));
    if (agentIds.size === 1) {
        return {
            mode: 'shared-explicit',
            accounts,
            sharedAgentId: agentIds.values().next().value,
        };
    }
    return { mode: 'isolated', accounts };
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function accountNames(accounts) {
    return accounts.map((a) => a.name ?? a.accountId).join('、');
}
function isMultiTenant(cfg) {
    const accounts = getEnabledLarkAccounts(cfg);
    if (accounts.length <= 1)
        return false;
    const appIds = new Set(accounts.map((a) => (a.configured ? a.appId : undefined)).filter((id) => !!id));
    return appIds.size > 1;
}
// ---------------------------------------------------------------------------
// Session dmScope
// ---------------------------------------------------------------------------
const RECOMMENDED_DM_SCOPE = 'per-account-channel-peer';
/**
 * Check whether `session.dmScope` is set to per-account isolation.
 *
 * Without this setting, different bots talking to the same user share
 * the same session — even if agent bindings are configured.
 */
export function needsDmScopeFix(cfg) {
    if (!isMultiTenant(cfg))
        return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return cfg.session?.dmScope !== RECOMMENDED_DM_SCOPE;
}
/** Return the fix command string, or null if not needed. */
export function getDmScopeFixCommand(cfg) {
    if (!needsDmScopeFix(cfg))
        return null;
    return `openclaw config set session.dmScope "${RECOMMENDED_DM_SCOPE}"`;
}
/** User-facing dmScope warning block (markdown). */
function formatDmScopeWarning() {
    return ('⚠️ **私聊消息串混**\n\n' +
        '当同一个用户同时使用多个机器人时，不同机器人的私聊消息会混在同一段对话里，' +
        '导致 AI 无法区分用户在跟哪个机器人说话。');
}
// ---------------------------------------------------------------------------
// Warning text for /feishu doctor & /feishu start
// ---------------------------------------------------------------------------
/**
 * Generate a combined warning block for doctor / start.
 * Returns null when everything is fine.
 */
export function formatIsolationWarning(status, cfg) {
    const sections = [];
    // Agent sharing warning
    if (status.mode === 'shared-implicit') {
        const names = accountNames(status.accounts);
        sections.push(`⚠️ **多个机器人共用记忆，对话内容可能互相可见**\n\n` +
            `当前 ${status.accounts.length} 个飞书机器人（${names}）共用同一个 AI 记忆。\n` +
            `用户 A 跟机器人「${status.accounts[0].name ?? status.accounts[0].accountId}」说的话，` +
            `可能出现在机器人「${status.accounts[1]?.name ?? status.accounts[1]?.accountId ?? '...'}」的回复中。\n\n` +
            `👉 发送 **/feishu isolate** 一键查看修复方案`);
    }
    // dmScope warning
    if (cfg && needsDmScopeFix(cfg)) {
        sections.push(formatDmScopeWarning() + '\n\n' + '👉 发送 **/feishu isolate** 一键查看修复方案');
    }
    if (sections.length === 0)
        return null;
    return sections.join('\n\n---\n\n');
}
// ---------------------------------------------------------------------------
// Fix command generation
// ---------------------------------------------------------------------------
/**
 * Generate `openclaw config set` commands for per-account isolation.
 */
export function generateIsolationFixCommands(cfg) {
    const status = checkMultiAccountIsolation(cfg);
    if (status.mode !== 'shared-implicit')
        return null;
    const accounts = status.accounts;
    const commands = [];
    const agentsList = accounts.map((a) => ({
        id: `feishu-${a.accountId}`,
        name: `飞书 ${a.name ?? a.accountId}`,
    }));
    commands.push(`openclaw config set agents.list '${JSON.stringify(agentsList)}' --json`);
    const bindings = accounts.map((a) => ({
        match: { channel: 'feishu', accountId: a.accountId },
        agentId: `feishu-${a.accountId}`,
    }));
    commands.push(`openclaw config set bindings '${JSON.stringify(bindings)}' --json`);
    const dmScopeCmd = getDmScopeFixCommand(cfg);
    if (dmScopeCmd)
        commands.push(dmScopeCmd);
    commands.push('openclaw gateway restart');
    const previewLines = accounts.map((a) => `  ${a.name ?? a.accountId}  →  独立记忆（feishu-${a.accountId}）`);
    return { commands, preview: previewLines.join('\n') };
}
/**
 * Generate commands for explicitly sharing the same agent across accounts.
 */
export function generateSharedAgentCommands(cfg) {
    const status = checkMultiAccountIsolation(cfg);
    if (status.mode !== 'shared-implicit')
        return null;
    const accounts = status.accounts;
    const commands = [];
    const bindings = accounts.map((a) => ({
        match: { channel: 'feishu', accountId: a.accountId },
        agentId: 'default',
    }));
    commands.push(`openclaw config set bindings '${JSON.stringify(bindings)}' --json`);
    const dmScopeCmd = getDmScopeFixCommand(cfg);
    if (dmScopeCmd)
        commands.push(dmScopeCmd);
    commands.push('openclaw gateway restart');
    const previewLines = accounts.map((a) => `  ${a.name ?? a.accountId}  →  共用记忆（default）`);
    return { commands, preview: previewLines.join('\n') };
}
// ---------------------------------------------------------------------------
// collectWarnings adapter (for SDK security.collectWarnings)
// ---------------------------------------------------------------------------
export function collectIsolationWarnings(_cfg) {
    // TODO: 产品明确多账号隔离方案后再透出告警
    return [];
}
// ---------------------------------------------------------------------------
// Startup log
// ---------------------------------------------------------------------------
export function emitSecurityWarnings(_cfg, _logger) {
    // TODO: 产品明确多账号隔离方案后再透出告警
}
