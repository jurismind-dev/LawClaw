import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Chat } from '@/pages/Chat';
import { ChatMessage } from '@/pages/Chat/ChatMessage';
import botAvatar from '@/assets/bot-avatar.png';
import { useChatStore, type RawMessage } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';
import { useAgentPresetMigrationStore } from '@/stores/agent-preset-migration';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/pages/Chat/ChatToolbar', () => ({
  ChatToolbar: () => <div data-testid="chat-toolbar" />,
}));

vi.mock('@/pages/Chat/ChatInput', () => ({
  ChatInput: () => <div data-testid="chat-input" />,
}));

vi.mock('@/components/common/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

type ExtendedMigrationState = ReturnType<typeof useAgentPresetMigrationStore.getState> & {
  dismissCurrentWarning?: () => void;
  isCurrentWarningVisible?: boolean;
};

describe('chat bot avatar', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();

    useGatewayStore.setState({
      status: { state: 'running', port: 18789 },
      isInitialized: true,
      lastError: null,
    });

    useChatStore.setState({
      messages: [],
      loading: false,
      sending: false,
      error: null,
      showThinking: false,
      streamingMessage: null,
      streamingTools: [],
      pendingFinal: false,
      loadHistory: vi.fn().mockResolvedValue(undefined),
      loadSessions: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      abortRun: vi.fn().mockResolvedValue(undefined),
      clearError: vi.fn(),
    });

    useAgentPresetMigrationStore.setState({
      status: null,
      isCurrentWarningVisible: false,
      dismissedWarningTargetHash: null,
    } as Partial<ExtendedMigrationState>);
  });

  it('renders the asset avatar for assistant chat messages', () => {
    const message: RawMessage = {
      role: 'assistant',
      content: 'assistant reply',
      timestamp: Date.now(),
    };

    const { container } = render(<ChatMessage message={message} showThinking={false} />);
    const avatar = screen.getByAltText('LawClaw avatar');

    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveAttribute('src', botAvatar);
    expect(container.querySelector('.lucide-sparkles')).toBeNull();
  });

  it('renders the asset avatar on the welcome screen', () => {
    const { container } = render(<Chat />);
    const avatar = screen.getByAltText('LawClaw avatar');

    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveAttribute('src', botAvatar);
    expect(container.querySelector('.lucide-bot')).toBeNull();
  });

  it('renders the asset avatar while the assistant is typing', () => {
    useChatStore.setState({
      sending: true,
      pendingFinal: false,
    });

    render(<Chat />);

    const avatar = screen.getByAltText('LawClaw avatar');

    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveAttribute('src', botAvatar);
  });

  it('renders the asset avatar while processing tool results', () => {
    useChatStore.setState({
      sending: true,
      pendingFinal: true,
    });

    render(<Chat />);

    const avatar = screen.getByAltText('LawClaw avatar');

    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveAttribute('src', botAvatar);
  });
});
