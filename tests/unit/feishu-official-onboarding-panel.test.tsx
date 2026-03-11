import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FeishuOfficialOnboardingPanel } from '@/components/channels/FeishuOfficialOnboardingPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('FeishuOfficialOnboardingPanel', () => {
  const invokeMock = window.electron.ipcRenderer.invoke as unknown as ReturnType<typeof vi.fn>;
  const onMock = window.electron.ipcRenderer.on as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onMock.mockImplementation(() => vi.fn());

    invokeMock.mockImplementation(async (channel: string, payload?: unknown) => {
      switch (channel) {
        case 'feishu:getStatus':
          return {
            success: true,
            status: {
              phase: 'waiting_scan',
              configured: false,
              pluginInstalled: true,
              pairUrl: 'https://pair.example/secret-link',
              pairQrCode: null,
            },
          };
        case 'channel:getConfig':
          return {
            success: true,
            config: {},
          };
        case 'feishu:configureExistingApp':
          return {
            success: true,
            status: {
              phase: 'configured',
              configured: true,
              pluginInstalled: true,
            },
            payload,
          };
        default:
          return { success: true };
      }
    });
  });

  it('allows binding an existing app manually', async () => {
    render(<FeishuOfficialOnboardingPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'dialog.feishuOfficial.modeExisting' }));

    fireEvent.change(screen.getByLabelText('dialog.feishuOfficial.existingAppIdLabel'), {
      target: { value: 'cli_test_app' },
    });
    fireEvent.change(screen.getByLabelText('dialog.feishuOfficial.existingAppSecretLabel'), {
      target: { value: 'secret-value' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'dialog.feishuOfficial.saveExisting' }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('feishu:configureExistingApp', {
        appId: 'cli_test_app',
        appSecret: 'secret-value',
      });
    });
  });

  it('switches to existing-app mode automatically when saved credentials exist', async () => {
    invokeMock.mockImplementation(async (channel: string) => {
      switch (channel) {
        case 'feishu:getStatus':
          return {
            success: true,
            status: {
              phase: 'idle',
              configured: false,
              pluginInstalled: true,
            },
          };
        case 'channel:getConfig':
          return {
            success: true,
            config: {
              appId: 'cli_existing_app',
              appSecret: 'saved-secret',
            },
          };
        default:
          return { success: true };
      }
    });

    render(<FeishuOfficialOnboardingPanel />);

    expect(await screen.findByDisplayValue('cli_existing_app')).toBeInTheDocument();
    expect(screen.getByDisplayValue('saved-secret')).toBeInTheDocument();
  });

  it('does not render the raw pairing link or a copy-link action', async () => {
    render(<FeishuOfficialOnboardingPanel />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('feishu:getStatus');
    });

    expect(screen.queryByText('https://pair.example/secret-link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy/i })).not.toBeInTheDocument();
  });
});
