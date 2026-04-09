"use strict";
// SPDX-License-Identifier: MIT
/**
 * Agent configuration helpers for the Lark/Feishu channel plugin.
 *
 * Reads agent-level configuration (identity, skills, tools, subagents)
 * from the top-level `agents.list` in OpenClawConfig.  These helpers
 * bridge the gap between the SDK's agent infrastructure and the Feishu
 * plugin's dispatch/reply layers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.listConfiguredAgents = listConfiguredAgents;
exports.resolveAgentEntry = resolveAgentEntry;
exports.getAgentDisplayName = getAgentDisplayName;
exports.getAgentSkillsFilter = getAgentSkillsFilter;
exports.getAgentToolsPolicy = getAgentToolsPolicy;
exports.mergeSkillFilters = mergeSkillFilters;
exports.isToolAllowedByPolicy = isToolAllowedByPolicy;
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Retrieve the full list of configured agents from config.
 *
 * @param cfg - The top-level application config.
 * @returns Array of agent entries, or empty array if none configured.
 */
function listConfiguredAgents(cfg) {
    const agents = cfg.agents;
    return agents?.list ?? [];
}
/**
 * Look up a specific agent's configuration by its ID.
 *
 * @param cfg - The top-level application config.
 * @param agentId - The agent ID to search for.
 * @returns The matching agent entry, or `undefined` if not found.
 */
function resolveAgentEntry(cfg, agentId) {
    return listConfiguredAgents(cfg).find((a) => a.id === agentId);
}
/**
 * Resolve a human-readable display name for an agent.
 *
 * Priority: `identity.name` > `name` > `undefined`.
 *
 * @param cfg - The top-level application config.
 * @param agentId - The agent ID.
 * @returns The display name, or `undefined` if none configured.
 */
function getAgentDisplayName(cfg, agentId) {
    const entry = resolveAgentEntry(cfg, agentId);
    if (!entry)
        return undefined;
    return entry.identity?.name ?? entry.name;
}
/**
 * Resolve the per-agent skills filter.
 *
 * @param cfg - The top-level application config.
 * @param agentId - The agent ID.
 * @returns Skill allowlist, or `undefined` if no agent-level filter.
 */
function getAgentSkillsFilter(cfg, agentId) {
    return resolveAgentEntry(cfg, agentId)?.skills;
}
/**
 * Resolve the per-agent tools policy (allow/deny lists).
 *
 * @param cfg - The top-level application config.
 * @param agentId - The agent ID.
 * @returns Tools policy object, or `undefined` if none configured.
 */
function getAgentToolsPolicy(cfg, agentId) {
    const entry = resolveAgentEntry(cfg, agentId);
    if (!entry?.tools)
        return undefined;
    const { allow, deny } = entry.tools;
    if (!allow && !deny)
        return undefined;
    return { allow, deny };
}
/**
 * Merge agent-level and group-level skill filters.
 *
 * When both are present, the effective filter is the intersection:
 * a skill must appear in both lists to be included.  When only one
 * is present, that list is used as-is.
 *
 * @param agentSkills - Per-agent skill allowlist (from AgentConfig.skills).
 * @param groupSkills - Per-group skill allowlist (from FeishuGroupConfig.skills).
 * @returns Merged skill filter, or `undefined` if neither is set.
 */
function mergeSkillFilters(agentSkills, groupSkills) {
    if (!agentSkills && !groupSkills)
        return undefined;
    if (!agentSkills)
        return groupSkills;
    if (!groupSkills)
        return agentSkills;
    // Intersection: group filter narrows the agent filter.
    const agentSet = new Set(agentSkills);
    return groupSkills.filter((s) => agentSet.has(s));
}
/**
 * Check whether a tool name is permitted by an agent's tool policy.
 *
 * Evaluation order:
 *   1. If `deny` list exists and tool matches → denied.
 *   2. If `allow` list exists and tool does NOT match → denied.
 *   3. Otherwise → allowed.
 *
 * Supports glob-like patterns with trailing `*` (e.g. `feishu_calendar_*`).
 *
 * @param toolName - The tool name being invoked.
 * @param policy - The agent's tool policy.
 * @returns `true` if the tool is allowed, `false` if denied.
 */
function isToolAllowedByPolicy(toolName, policy) {
    if (!policy)
        return true;
    if (policy.deny && policy.deny.length > 0) {
        if (matchesAnyPattern(toolName, policy.deny))
            return false;
    }
    if (policy.allow && policy.allow.length > 0) {
        return matchesAnyPattern(toolName, policy.allow);
    }
    return true;
}
/**
 * Check whether a string matches any of the given patterns.
 * Supports trailing `*` as a simple wildcard.
 */
function matchesAnyPattern(value, patterns) {
    for (const pattern of patterns) {
        if (pattern === '*')
            return true;
        if (pattern.endsWith('*')) {
            if (value.startsWith(pattern.slice(0, -1)))
                return true;
        }
        else if (value === pattern) {
            return true;
        }
    }
    return false;
}
