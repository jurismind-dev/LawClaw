/**
 * Agent configuration helpers for the Lark/Feishu channel plugin.
 *
 * Reads agent-level configuration (identity, skills, tools, subagents)
 * from the top-level `agents.list` in OpenClawConfig.  These helpers
 * bridge the gap between the SDK's agent infrastructure and the Feishu
 * plugin's dispatch/reply layers.
 */
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
/** Minimal agent identity fields used by the Feishu plugin. */
interface AgentIdentity {
    name?: string;
    emoji?: string;
    avatar?: string;
}
/** Minimal agent tools policy fields. */
interface AgentToolsPolicy {
    allow?: string[];
    deny?: string[];
}
/** Shape of an agent entry in `config.agents.list`. */
interface AgentEntry {
    id: string;
    name?: string;
    skills?: string[];
    identity?: AgentIdentity;
    tools?: AgentToolsPolicy & Record<string, unknown>;
    subagents?: {
        allowAgents?: string[];
    };
}
/**
 * Retrieve the full list of configured agents from config.
 *
 * @param cfg - The top-level application config.
 * @returns Array of agent entries, or empty array if none configured.
 */
export declare function listConfiguredAgents(cfg: ClawdbotConfig): AgentEntry[];
/**
 * Look up a specific agent's configuration by its ID.
 *
 * @param cfg - The top-level application config.
 * @param agentId - The agent ID to search for.
 * @returns The matching agent entry, or `undefined` if not found.
 */
export declare function resolveAgentEntry(cfg: ClawdbotConfig, agentId: string): AgentEntry | undefined;
/**
 * Resolve a human-readable display name for an agent.
 *
 * Priority: `identity.name` > `name` > `undefined`.
 *
 * @param cfg - The top-level application config.
 * @param agentId - The agent ID.
 * @returns The display name, or `undefined` if none configured.
 */
export declare function getAgentDisplayName(cfg: ClawdbotConfig, agentId: string): string | undefined;
/**
 * Resolve the per-agent skills filter.
 *
 * @param cfg - The top-level application config.
 * @param agentId - The agent ID.
 * @returns Skill allowlist, or `undefined` if no agent-level filter.
 */
export declare function getAgentSkillsFilter(cfg: ClawdbotConfig, agentId: string): string[] | undefined;
/**
 * Resolve the per-agent tools policy (allow/deny lists).
 *
 * @param cfg - The top-level application config.
 * @param agentId - The agent ID.
 * @returns Tools policy object, or `undefined` if none configured.
 */
export declare function getAgentToolsPolicy(cfg: ClawdbotConfig, agentId: string): AgentToolsPolicy | undefined;
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
export declare function mergeSkillFilters(agentSkills: string[] | undefined, groupSkills: string[] | undefined): string[] | undefined;
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
export declare function isToolAllowedByPolicy(toolName: string, policy: AgentToolsPolicy | undefined): boolean;
export {};
