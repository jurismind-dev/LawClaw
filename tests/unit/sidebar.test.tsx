import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { ChatToolbar } from '@/pages/Chat/ChatToolbar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useChatStore } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';
import { useSettingsStore } from '@/stores/settings';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  };
});

describe('sidebar clawx alignment', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      sidebarCollapsed: false,
      devModeUnlocked: false,
    });

    useGatewayStore.setState({
      status: { state: 'running', port: 18789 },
      isInitialized: true,
      lastError: null,
    });

    useChatStore.setState({
      sessions: [
        { key: 'agent:lawclaw-main:main' },
        { key: 'agent:lawclaw-main:session-1' },
      ],
      currentSessionKey: 'agent:lawclaw-main:session-1',
      sessionLabels: {
        'agent:lawclaw-main:session-1': 'Draft memo',
      },
      sessionLastActivity: {
        'agent:lawclaw-main:session-1': 1_000,
      },
      messages: [],
      loading: false,
      showThinking: false,
      loadSessions: vi.fn().mockResolvedValue(undefined),
      loadHistory: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      toggleThinking: vi.fn(),
      newSession: vi.fn(),
      switchSession: vi.fn(),
      deleteSession: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('renders the latest clawx-style buckets, delete entry, and footer settings', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
      </MemoryRouter>,
    );

    expect(screen.getByText('劳有钳')).toBeInTheDocument();
    const newChatButton = screen.getByRole('button', { name: 'common:sidebar.newChat' });
    const historyBucket = screen.getByText('chat:historyBuckets.older');
    const channelsLink = screen.getByRole('link', { name: 'sidebar.channels' });

    expect(newChatButton).toBeInTheDocument();
    expect(historyBucket).toBeInTheDocument();
    expect(screen.getByText('Draft memo')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Delete session' }).length).toBeGreaterThan(0);
    expect(newChatButton.compareDocumentPosition(historyBucket) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(historyBucket.compareDocumentPosition(channelsLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'sidebar.channels',
      'sidebar.skills',
      'sidebar.cronTasks',
      'sidebar.dashboard',
      'common:sidebar.settings',
    ]);
    expect(links.at(-1)).toHaveTextContent('common:sidebar.settings');
  });

  it('shows the current conversation target in the chat toolbar', () => {
    render(
      <TooltipProvider>
        <ChatToolbar />
      </TooltipProvider>,
    );

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('toolbar.currentAgent')).toBeInTheDocument();
  });
});
