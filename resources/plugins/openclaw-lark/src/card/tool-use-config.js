"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Resolution logic for Feishu tool-use display.
 *
 * The source of truth is OpenClaw's effective verbose state:
 * inline `/verbose` override > session store override > config default.
 * Feishu channel config only retains UI-level detail (`showFullPaths`).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveToolUseDisplayConfig = resolveToolUseDisplayConfig;
const agent_runtime_1 = require("openclaw/plugin-sdk/agent-runtime");
const config_runtime_1 = require("openclaw/plugin-sdk/config-runtime");
function resolveToolUseDisplayConfig(params) {
    const mode = resolveEffectiveVerboseMode(params);
    return {
        mode,
        showToolUse: mode !== 'off',
        showToolResultDetails: mode === 'full',
        showFullPaths: params.feishuCfg?.toolUseDisplay?.showFullPaths === true,
    };
}
function resolveEffectiveVerboseMode(params) {
    return (extractInlineVerboseMode(params.body) ??
        resolveSessionVerboseMode(params.cfg, params.sessionKey, params.agentId) ??
        normalizeToolUseMode(params.cfg.agents?.defaults?.verboseDefault) ??
        'off');
}
function resolveSessionVerboseMode(cfg, sessionKey, agentId) {
    try {
        const cfgWithSession = cfg;
        const sessionStorePath = cfgWithSession.session?.store ?? cfgWithSession.sessions?.store;
        const storePath = (0, config_runtime_1.resolveStorePath)(sessionStorePath, { agentId });
        const store = (0, config_runtime_1.loadSessionStore)(storePath);
        const candidateKeys = resolveCandidateSessionKeys(cfg, sessionKey);
        for (const candidateKey of candidateKeys) {
            const resolved = (0, config_runtime_1.resolveSessionStoreEntry)({ store, sessionKey: candidateKey });
            const mode = normalizeToolUseMode(resolved.existing?.verboseLevel);
            if (mode)
                return mode;
            if (resolved.existing)
                return undefined;
        }
        return undefined;
    }
    catch {
        return undefined;
    }
}
function resolveCandidateSessionKeys(cfg, sessionKey) {
    const key = sessionKey.trim().toLowerCase();
    const defaultAgentId = (0, agent_runtime_1.resolveDefaultAgentId)(cfg);
    const fallbackKey = key.replace(/^(agent):[^:]+:/, `$1:${defaultAgentId}:`);
    return fallbackKey !== key ? [key, fallbackKey] : [key];
}
function extractInlineVerboseMode(body) {
    if (!body)
        return undefined;
    const matches = body.matchAll(/(?:^|\s)\/(?:verbose|v)(?::|\s+)(on|off|full)\b/gi);
    let last;
    for (const match of matches) {
        last = normalizeToolUseMode(match[1]);
    }
    return last;
}
function normalizeToolUseMode(value) {
    if (typeof value !== 'string')
        return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'off' || normalized === 'on' || normalized === 'full') {
        return normalized;
    }
    return undefined;
}
