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
  it('only exposes simplified migration invoke channels and status event subscription', async () => {
    await import('@electron/preload/index');

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
    const [, api] = exposeInMainWorld.mock.calls[0];

    await api.ipcRenderer.invoke('agentPresetMigration:getStatus');
    expect(invoke).toHaveBeenCalledWith('agentPresetMigration:getStatus');

    await api.ipcRenderer.invoke('agentPresetMigration:getArtifactsDir');
    expect(invoke).toHaveBeenCalledWith('agentPresetMigration:getArtifactsDir');

    expect(() => api.ipcRenderer.invoke('agentPresetMigration:retryNow')).toThrow(
      'Invalid IPC channel: agentPresetMigration:retryNow'
    );

    const unsubscribe = api.ipcRenderer.on('agentPresetMigration:statusChanged', () => {});
    expect(on).toHaveBeenCalled();
    expect(typeof unsubscribe).toBe('function');

    expect(() => api.ipcRenderer.on('agentPresetMigration:chatLockChanged', () => {})).toThrow(
      'Invalid IPC channel: agentPresetMigration:chatLockChanged'
    );
  });
});
