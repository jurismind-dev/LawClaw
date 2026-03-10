import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Chat } from '@/pages/Chat';
import { useChatStore } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';
import { useAgentPresetMigrationStore } from '@/stores/agent-preset-migration';
import type { AgentPresetMigrationStatus } from '@/types/agent-preset-migration';

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

vi.mock('@/pages/Chat/ChatMessage', () => ({
  ChatMessage: () => <div data-testid="chat-message" />,
}));

vi.mock('@/components/common/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

type ExtendedMigrationState = ReturnType<typeof useAgentPresetMigrationStore.getState> & {
  dismissCurrentWarning?: () => void;
  isCurrentWarningVisible?: boolean;
};

function setMigrationStatus(status: AgentPresetMigrationStatus, isCurrentWarningVisible: boolean) {
  useAgentPresetMigrationStore.setState({
    status,
    isCurrentWarningVisible,
  } as Partial<ExtendedMigrationState>);
}

describe('chat migration warning banner', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    localStorage.clear();

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

  it('renders simplified warning banner without engineering details', () => {
    setMigrationStatus(
      {
        state: 'warning',
        targetHash: 'target-hash-1',
        message: '部分预设文件检测到本地修改，已跳过自动更新，请手动对比 v_current / v_update',
        skippedFiles: 1,
        skippedTargets: ['SOUL.md'],
        updatedAt: '2026-03-10T00:00:00.000Z',
      },
      true
    );

    render(<Chat />);

    expect(screen.getByText('LawClaw 预设升级发现部分本地配置冲突。')).toBeInTheDocument();
    expect(screen.getByText('系统已跳过自动更新，你可以继续正常使用。')).toBeInTheDocument();
    expect(screen.queryByText(/SOUL\.md/)).not.toBeInTheDocument();
    expect(screen.queryByText(/v_current|v_update/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '打开迁移目录' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭预设升级冲突提醒' })).toBeInTheDocument();
  });

  it('hides dismissed warning for same targetHash and shows it again for a new targetHash', () => {
    setMigrationStatus(
      {
        state: 'warning',
        targetHash: 'target-hash-1',
        updatedAt: '2026-03-10T00:00:00.000Z',
      },
      true
    );

    const view = render(<Chat />);
    fireEvent.click(screen.getByRole('button', { name: '关闭预设升级冲突提醒' }));
    expect(screen.queryByText('LawClaw 预设升级发现部分本地配置冲突。')).not.toBeInTheDocument();

    view.unmount();

    setMigrationStatus(
      {
        state: 'warning',
        targetHash: 'target-hash-1',
        updatedAt: '2026-03-10T00:00:00.000Z',
      },
      false
    );
    const secondView = render(<Chat />);
    expect(screen.queryByText('LawClaw 预设升级发现部分本地配置冲突。')).not.toBeInTheDocument();

    act(() => {
      useAgentPresetMigrationStore.setState({
        status: {
          state: 'warning',
          targetHash: 'target-hash-2',
          updatedAt: '2026-03-11T00:00:00.000Z',
        },
        isCurrentWarningVisible: true,
      } as Partial<ExtendedMigrationState>);
    });

    expect(screen.getByText('LawClaw 预设升级发现部分本地配置冲突。')).toBeInTheDocument();
    secondView.unmount();
  });
});