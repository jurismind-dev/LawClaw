import type { AgentSummary } from '@/types/agent';

export function normalizeAgentLookupId(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase();
}

export function findAgentByIdOrAcpAlias(
  agents: AgentSummary[] | undefined,
  agentId: string | undefined | null,
): AgentSummary | undefined {
  const normalizedId = normalizeAgentLookupId(agentId);
  if (!normalizedId) return undefined;

  const list = agents ?? [];
  return list.find((agent) => normalizeAgentLookupId(agent.id) === normalizedId)
    ?? list.find((agent) => (
      agent.runtime?.type === 'acp'
      && normalizeAgentLookupId(agent.runtime.acp?.agent || agent.id) === normalizedId
    ));
}

export function getAgentDisplayName(
  agents: AgentSummary[] | undefined,
  agentId: string | undefined | null,
): string {
  const agent = findAgentByIdOrAcpAlias(agents, agentId);
  const normalizedId = normalizeAgentLookupId(agentId);
  if (agent?.name) return agent.name;
  if (!normalizedId || normalizedId === 'lawclaw-main') return 'LawClaw';
  return agentId || 'LawClaw';
}
