import { create } from 'zustand';
import type { AgentPresetMigrationStatus } from '@/types/agent-preset-migration';

const DISMISSED_WARNING_KEY = 'lawclaw.agentPresetMigration.dismissedWarningTargetHash';

interface AgentPresetMigrationStore {
  status: AgentPresetMigrationStatus | null;
  isInitialized: boolean;
  dismissedWarningTargetHash: string | null;
  isCurrentWarningVisible: boolean;
  init: () => Promise<void>;
  dismissCurrentWarning: () => void;
}

let initPromise: Promise<void> | null = null;

function readDismissedWarningTargetHash(): string | null {
  try {
    return localStorage.getItem(DISMISSED_WARNING_KEY);
  } catch {
    return null;
  }
}

function writeDismissedWarningTargetHash(targetHash: string | null): void {
  try {
    if (targetHash) {
      localStorage.setItem(DISMISSED_WARNING_KEY, targetHash);
      return;
    }
    localStorage.removeItem(DISMISSED_WARNING_KEY);
  } catch {
    // ignore storage errors
  }
}

function computeWarningVisibility(
  status: AgentPresetMigrationStatus | null,
  dismissedWarningTargetHash: string | null
): boolean {
  if (!status || status.state !== 'warning') {
    return false;
  }

  if (!status.targetHash) {
    return true;
  }

  return status.targetHash !== dismissedWarningTargetHash;
}

export const useAgentPresetMigrationStore = create<AgentPresetMigrationStore>((set, get) => ({
  status: null,
  isInitialized: false,
  dismissedWarningTargetHash: readDismissedWarningTargetHash(),
  isCurrentWarningVisible: false,

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
      const dismissedWarningTargetHash = readDismissedWarningTargetHash();
      set({
        status,
        isInitialized: true,
        dismissedWarningTargetHash,
        isCurrentWarningVisible: computeWarningVisibility(status, dismissedWarningTargetHash),
      });

      window.electron.ipcRenderer.on('agentPresetMigration:statusChanged', (nextStatus) => {
        set((state) => ({
          status: nextStatus as AgentPresetMigrationStatus,
          isCurrentWarningVisible: computeWarningVisibility(
            nextStatus as AgentPresetMigrationStatus,
            state.dismissedWarningTargetHash
          ),
        }));
      });
    })();

    await initPromise;
    initPromise = null;
  },

  dismissCurrentWarning: () => {
    const { status } = get();
    if (status?.state !== 'warning' || !status.targetHash) {
      return;
    }

    writeDismissedWarningTargetHash(status.targetHash);
    set({
      dismissedWarningTargetHash: status.targetHash,
      isCurrentWarningVisible: false,
    });
  },
}));
