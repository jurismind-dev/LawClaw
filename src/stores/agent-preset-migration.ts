import { create } from 'zustand';
import type {
  AgentPresetConflictDecision,
  AgentPresetMigrationStatus,
} from '@/types/agent-preset-migration';

interface AgentPresetMigrationStore {
  status: AgentPresetMigrationStatus | null;
  chatLocked: boolean;
  isInitialized: boolean;
  init: () => Promise<void>;
  resolveConflict: (decision: AgentPresetConflictDecision) => Promise<{ success: boolean; message?: string }>;
  retryNow: () => Promise<void>;
}

let initPromise: Promise<void> | null = null;

export const useAgentPresetMigrationStore = create<AgentPresetMigrationStore>((set, get) => ({
  status: null,
  chatLocked: false,
  isInitialized: false,

  init: async () => {
    if (get().isInitialized) return;
    if (initPromise) {
      await initPromise;
      return;
    }

    initPromise = (async () => {
      const status = await window.electron.ipcRenderer.invoke('agentPresetMigration:getStatus') as AgentPresetMigrationStatus;
      set({
        status,
        chatLocked: status.chatLocked,
        isInitialized: true,
      });

      window.electron.ipcRenderer.on('agentPresetMigration:statusChanged', (nextStatus) => {
        const typed = nextStatus as AgentPresetMigrationStatus;
        set({
          status: typed,
          chatLocked: typed.chatLocked,
        });
      });

      window.electron.ipcRenderer.on('agentPresetMigration:chatLockChanged', (payload) => {
        const locked = Boolean((payload as { locked?: boolean })?.locked);
        set({ chatLocked: locked });
      });
    })();

    await initPromise;
    initPromise = null;
  },

  resolveConflict: async (decision) => {
    const result = await window.electron.ipcRenderer.invoke(
      'agentPresetMigration:resolveConflict',
      decision
    ) as { success: boolean; message?: string };
    return result;
  },

  retryNow: async () => {
    await window.electron.ipcRenderer.invoke('agentPresetMigration:retryNow');
  },
}));

