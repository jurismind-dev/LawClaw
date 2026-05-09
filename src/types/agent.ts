export interface AgentAcpRuntimeConfig {
  agent?: string;
  backend?: string;
  mode?: string;
  cwd?: string;
}

export interface AgentRuntimeConfig {
  type: 'acp';
  acp?: AgentAcpRuntimeConfig;
}

export interface AgentSummary {
  id: string;
  name: string;
  isDefault: boolean;
  modelDisplay: string;
  modelRef?: string | null;
  overrideModelRef?: string | null;
  inheritedModel: boolean;
  workspace: string;
  agentDir: string;
  mainSessionKey: string;
  channelTypes: string[];
  runtime?: AgentRuntimeConfig;
}

export interface AgentsSnapshot {
  agents: AgentSummary[];
  defaultAgentId: string;
  defaultModelRef?: string | null;
  configuredChannelTypes: string[];
  channelOwners?: Record<string, string>;
  channelAccountOwners?: Record<string, string>;
}
