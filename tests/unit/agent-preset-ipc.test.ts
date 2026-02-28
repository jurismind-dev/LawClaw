import { describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const on = vi.fn();
const removeListener = vi.fn();
const removeAllListeners = vi.fn();
const once = vi.fn();
const exposeInMainWorld = vi.fn();

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld,
  },
  ipcRenderer: {
    invoke,
    on,
    once,
    removeListener,
    removeAllListeners,
  },
}));

describe('agent preset migration IPC preload channels', () => {
  it('暴露迁移 invoke + 事件订阅通道', async () => {
    await import('@electron/preload/index');

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
    const [, api] = exposeInMainWorld.mock.calls[0];

    await api.ipcRenderer.invoke('agentPresetMigration:getStatus');
    expect(invoke).toHaveBeenCalledWith('agentPresetMigration:getStatus');

    await api.ipcRenderer.invoke('agentPresetMigration:retryNow');
    expect(invoke).toHaveBeenCalledWith('agentPresetMigration:retryNow');

    await api.ipcRenderer.invoke('agentPresetMigration:getArtifactsDir');
    expect(invoke).toHaveBeenCalledWith('agentPresetMigration:getArtifactsDir');

    const unsubscribe = api.ipcRenderer.on('agentPresetMigration:statusChanged', () => {});
    expect(on).toHaveBeenCalled();
    expect(typeof unsubscribe).toBe('function');
  });
});

