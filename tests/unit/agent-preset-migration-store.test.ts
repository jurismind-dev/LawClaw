import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentPresetMigrationStatus } from '@/types/agent-preset-migration';

const DISMISSED_WARNING_KEY = 'lawclaw.agentPresetMigration.dismissedWarningTargetHash';

interface ExtendedMigrationStore {
  status: AgentPresetMigrationStatus | null;
  isInitialized: boolean;
  isCurrentWarningVisible?: boolean;
  dismissCurrentWarning?: () => void;
  init: () => Promise<void>;
}

async function loadStore() {
  vi.resetModules();
  const module = await import('@/stores/agent-preset-migration');
  return module.useAgentPresetMigrationStore;
}

function mockInitStatus(status: AgentPresetMigrationStatus) {
  vi.mocked(window.electron.ipcRenderer.invoke).mockResolvedValue(status);
  vi.mocked(window.electron.ipcRenderer.on).mockImplementation(() => vi.fn());
}

describe('agent preset migration store warning dismissal', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('shows warning when current targetHash has not been dismissed', async () => {
    mockInitStatus({
      state: 'warning',
      targetHash: 'target-hash-1',
      updatedAt: '2026-03-10T00:00:00.000Z',
    });

    const store = await loadStore();
    await store.getState().init();

    const state = store.getState() as ExtendedMigrationStore;
    expect(state.isCurrentWarningVisible).toBe(true);
  });

  it('dismisses current warning and keeps same targetHash hidden after re-init', async () => {
    const status = {
      state: 'warning',
      targetHash: 'target-hash-1',
      updatedAt: '2026-03-10T00:00:00.000Z',
    } satisfies AgentPresetMigrationStatus;

    mockInitStatus(status);
    const store = await loadStore();
    await store.getState().init();

    const state = store.getState() as ExtendedMigrationStore;
    state.dismissCurrentWarning?.();
    expect(localStorage.getItem(DISMISSED_WARNING_KEY)).toBe('target-hash-1');

    mockInitStatus(status);
    const reloadedStore = await loadStore();
    await reloadedStore.getState().init();

    const reloadedState = reloadedStore.getState() as ExtendedMigrationStore;
    expect(reloadedState.isCurrentWarningVisible).toBe(false);
  });

  it('shows warning again when a new targetHash arrives', async () => {
    localStorage.setItem(DISMISSED_WARNING_KEY, 'target-hash-1');

    mockInitStatus({
      state: 'warning',
      targetHash: 'target-hash-2',
      updatedAt: '2026-03-10T00:00:00.000Z',
    });

    const store = await loadStore();
    await store.getState().init();

    const state = store.getState() as ExtendedMigrationStore;
    expect(state.isCurrentWarningVisible).toBe(true);
  });

  it('does not show warning for non-warning states and keeps warning without targetHash visible', async () => {
    const statuses: AgentPresetMigrationStatus[] = [
      { state: 'idle', updatedAt: '2026-03-10T00:00:00.000Z' },
      { state: 'running', updatedAt: '2026-03-10T00:00:00.000Z' },
      { state: 'failed', updatedAt: '2026-03-10T00:00:00.000Z' },
    ];

    for (const status of statuses) {
      mockInitStatus(status);
      const store = await loadStore();
      await store.getState().init();
      const state = store.getState() as ExtendedMigrationStore;
      expect(state.isCurrentWarningVisible).toBe(false);
    }

    mockInitStatus({
      state: 'warning',
      updatedAt: '2026-03-10T00:00:00.000Z',
    });
    const warningStore = await loadStore();
    await warningStore.getState().init();
    const warningState = warningStore.getState() as ExtendedMigrationStore;
    expect(warningState.isCurrentWarningVisible).toBe(true);
  });
});
