import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TitleBar } from '@/components/layout/TitleBar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useProviderStore } from '@/stores/providers';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('title bar coin access visibility', () => {
  beforeEach(() => {
    window.electron.platform = 'darwin';
    useProviderStore.setState({
      providers: [],
      defaultProviderId: null,
      loading: false,
      error: null,
    });

    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (channel: string) => {
      if (channel === 'provider:list') {
        return [];
      }
      if (channel === 'provider:getDefault') {
        return null;
      }
      if (channel === 'window:isMaximized') {
        return false;
      }
      return null;
    });
  });

  it('hides the coin access button on setup routes', () => {
    renderTitleBar('/setup');

    expect(screen.queryByRole('button', { name: 'brand.getCoins' })).not.toBeInTheDocument();
  });

  it('keeps the coin access button on non-setup routes', async () => {
    renderTitleBar('/');

    expect(screen.getByRole('button', { name: 'brand.getCoins' })).toBeInTheDocument();
    await waitFor(() => {
      expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith('provider:list');
    });
  });

  it('uses macOS native title bar controls instead of custom right-side buttons', async () => {
    window.electron.platform = 'darwin';

    renderTitleBar('/chat');

    expect(screen.queryByTitle('最小化')).not.toBeInTheDocument();
    expect(screen.queryByTitle('最大化')).not.toBeInTheDocument();
    expect(screen.queryByTitle('关闭')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith('provider:list');
    });
  });

  it('uses custom right-side window buttons on windows layouts', async () => {
    window.electron.platform = 'win32';

    renderTitleBar('/chat');

    expect(await screen.findByTitle('最小化')).toBeInTheDocument();
    expect(screen.getByTitle('最大化')).toBeInTheDocument();
    expect(screen.getByTitle('关闭')).toBeInTheDocument();
    expect(screen.getByText('劳有钳')).toBeInTheDocument();
  });

  it('shows the profile entry after jurismind binding metadata exists', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (channel: string) => {
      if (channel === 'provider:list') {
        return [
          {
            id: 'jurismind',
            name: 'Jurismind',
            type: 'jurismind',
            enabled: true,
            createdAt: '2026-03-26T00:00:00.000Z',
            updatedAt: '2026-03-26T00:00:00.000Z',
            hasKey: true,
            keyMasked: 'sk-***',
            openId: 'user-1',
            avatar: '',
          },
        ];
      }
      if (channel === 'provider:getDefault') {
        return 'jurismind';
      }
      return null;
    });

    renderTitleBar('/chat');

    const profileButton = await screen.findByRole('button', { name: 'brand.profileCenter' });
    expect(profileButton).toBeInTheDocument();

    fireEvent.click(profileButton);
    expect(window.electron.openExternal).toHaveBeenCalledWith(
      'https://lawclaw.jurismind.com/profile'
    );
  });

  it('does not show the profile entry when jurismind was not bound via login', async () => {
    vi.mocked(window.electron.ipcRenderer.invoke).mockImplementation(async (channel: string) => {
      if (channel === 'provider:list') {
        return [
          {
            id: 'jurismind',
            name: 'Jurismind',
            type: 'jurismind',
            enabled: true,
            createdAt: '2026-03-26T00:00:00.000Z',
            updatedAt: '2026-03-26T00:00:00.000Z',
            hasKey: true,
            keyMasked: 'sk-***',
          },
        ];
      }
      if (channel === 'provider:getDefault') {
        return 'jurismind';
      }
      return null;
    });

    renderTitleBar('/chat');

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'brand.profileCenter' })).not.toBeInTheDocument();
    });
  });
});

function renderTitleBar(pathname: string) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[pathname]}>
        <TitleBar />
      </MemoryRouter>
    </TooltipProvider>,
  );
}
