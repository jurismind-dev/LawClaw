import { create } from 'zustand';
import type { AgentPresetMigrationStatus } from '@/types/agent-preset-migration';

interface AgentPresetMigrationStore {
  status: AgentPresetMigrationStatus | null;
  isInitialized: boolean;
  init: () => Promise<void>;
}

let initPromise: Promise<void> | null = null;

export const useAgentPresetMigrationStore = create<AgentPresetMigrationStore>((set, get) => ({
  status: null,
  isInitialized: false,

  init: async () => {
    if (get().isInitialized) return;
    if (initPromise) {
      await initPromise;
      return;
    }

    initPromise = (async () => {
      const status = await window.electron.ipcRenderer.invoke(
        'agentPresetMigration:getStatus'
      ) as AgentPresetMigrationStatus;
      set({
        status,
        isInitialized: true,
      });

      window.electron.ipcRenderer.on('agentPresetMigration:statusChanged', (nextStatus) => {
        set({
          status: nextStatus as AgentPresetMigrationStatus,
        });
      });
    })();

    await initPromise;
    initPromise = null;
  },
}));
