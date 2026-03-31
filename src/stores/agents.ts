import { create } from 'zustand';
import type { AgentSummary, AgentsSnapshot } from '@/types/agent';

interface AgentsState {
  agents: AgentSummary[];
  defaultAgentId: string;
  defaultModelRef: string | null;
  configuredChannelTypes: string[];
  loading: boolean;
  error: string | null;
  fetchAgents: () => Promise<void>;
  createAgent: (name: string, options?: { inheritWorkspace?: boolean }) => Promise<void>;
  updateAgent: (agentId: string, name: string) => Promise<void>;
  updateAgentModel: (agentId: string, modelRef: string | null) => Promise<void>;
  deleteAgent: (agentId: string) => Promise<void>;
  clearError: () => void;
}

function applySnapshot(snapshot: AgentsSnapshot | undefined) {
  return snapshot ? {
    agents: snapshot.agents ?? [],
    defaultAgentId: snapshot.defaultAgentId ?? 'lawclaw-main',
    defaultModelRef: snapshot.defaultModelRef ?? null,
    configuredChannelTypes: snapshot.configuredChannelTypes ?? [],
  } : {};
}

export const useAgentsStore = create<AgentsState>((set) => ({
  agents: [],
  defaultAgentId: 'lawclaw-main',
  defaultModelRef: null,
  configuredChannelTypes: [],
  loading: false,
  error: null,

  fetchAgents: async () => {
    set({ loading: true, error: null });
    try {
      const snapshot = await window.electron.ipcRenderer.invoke('agents:list') as AgentsSnapshot & {
        success?: boolean;
        error?: string;
      };
      if (snapshot?.success === false) {
        throw new Error(snapshot.error || 'Failed to load agents');
      }
      set({
        ...applySnapshot(snapshot),
        loading: false,
      });
    } catch (error) {
      set({ loading: false, error: String(error) });
    }
  },

  createAgent: async (name: string, options?: { inheritWorkspace?: boolean }) => {
    set({ error: null });
    try {
      const snapshot = await window.electron.ipcRenderer.invoke('agents:create', {
        name,
        inheritWorkspace: options?.inheritWorkspace === true,
      }) as AgentsSnapshot & { success?: boolean; error?: string };
      if (snapshot?.success === false) {
        throw new Error(snapshot.error || 'Failed to create agent');
      }
      set(applySnapshot(snapshot));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  updateAgent: async (agentId: string, name: string) => {
    set({ error: null });
    try {
      const snapshot = await window.electron.ipcRenderer.invoke('agents:updateName', {
        agentId,
        name,
      }) as AgentsSnapshot & { success?: boolean; error?: string };
      if (snapshot?.success === false) {
        throw new Error(snapshot.error || 'Failed to update agent');
      }
      set(applySnapshot(snapshot));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  updateAgentModel: async (agentId: string, modelRef: string | null) => {
    set({ error: null });
    try {
      const snapshot = await window.electron.ipcRenderer.invoke('agents:updateModel', {
        agentId,
        modelRef,
      }) as AgentsSnapshot & { success?: boolean; error?: string };
      if (snapshot?.success === false) {
        throw new Error(snapshot.error || 'Failed to update agent model');
      }
      set(applySnapshot(snapshot));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  deleteAgent: async (agentId: string) => {
    set({ error: null });
    try {
      const snapshot = await window.electron.ipcRenderer.invoke('agents:delete', {
        agentId,
      }) as AgentsSnapshot & { success?: boolean; error?: string };
      if (snapshot?.success === false) {
        throw new Error(snapshot.error || 'Failed to delete agent');
      }
      set(applySnapshot(snapshot));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));
