import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settings';
import { useUpdateStore } from '@/stores/update';

describe('Update Store', () => {
  const invokeMock = vi.mocked(window.electron.ipcRenderer.invoke);
  const onMock = vi.mocked(window.electron.ipcRenderer.on);

  beforeEach(() => {
    useSettingsStore.setState({
      updateChannel: 'stable',
      autoCheckUpdate: true,
      autoDownloadUpdate: false,
    });

    useUpdateStore.setState({
      status: 'idle',
      currentVersion: '0.0.0',
      updateInfo: null,
      progress: null,
      error: null,
      isInitialized: false,
      autoInstallCountdown: null,
    });

    onMock.mockImplementation(() => vi.fn());
    invokeMock.mockImplementation(async (channel) => {
      if (channel === 'update:version') {
        return '0.1.16';
      }

      if (channel === 'update:status') {
        return { status: 'idle' };
      }

      return { success: true };
    });
  });

  it('syncs persisted updater channel and auto-download preference during init', async () => {
    useSettingsStore.setState({
      updateChannel: 'beta',
      autoCheckUpdate: false,
      autoDownloadUpdate: true,
    });

    await useUpdateStore.getState().init();

    expect(invokeMock).toHaveBeenCalledWith('update:setChannel', 'beta');
    expect(invokeMock).toHaveBeenCalledWith('update:setAutoDownload', true);
    expect(useUpdateStore.getState().isInitialized).toBe(true);
  });

  it('pushes disabled auto-download state to the main process too', async () => {
    useSettingsStore.setState({
      updateChannel: 'stable',
      autoCheckUpdate: false,
      autoDownloadUpdate: false,
    });

    await useUpdateStore.getState().init();

    expect(invokeMock).toHaveBeenCalledWith('update:setChannel', 'stable');
    expect(invokeMock).toHaveBeenCalledWith('update:setAutoDownload', false);
  });
});
