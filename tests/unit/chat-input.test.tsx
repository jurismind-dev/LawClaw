import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import i18n from '@/i18n';
import { ChatInput } from '@/pages/Chat/ChatInput';

describe('ChatInput', () => {
  beforeEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('zh');
    });
  });

  afterEach(async () => {
    vi.clearAllTimers();
    vi.useRealTimers();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('shows the updated zh placeholder when chat is available', () => {
    render(<ChatInput onSend={() => {}} />);

    expect(
      screen.getByPlaceholderText('将合同或案件材料导入工作区，即可开始处理')
    ).toBeInTheDocument();
  });

  it('shows the zh disabled placeholder when gateway is unavailable', () => {
    render(<ChatInput onSend={() => {}} disabled />);

    expect(screen.getByPlaceholderText('网关未连接...')).toBeInTheDocument();
  });

  it('shows the AI-generated notice below the composer', () => {
    render(<ChatInput onSend={() => {}} />);

    expect(screen.getByText('本地化运行，内容由AI生成，请仔细甄别')).toBeInTheDocument();
  });

  it('shows a dynamic generating placeholder while a task is running', async () => {
    vi.useFakeTimers();
    render(<ChatInput onSend={() => {}} taskRunning />);

    expect(screen.getByPlaceholderText('生成中...')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByPlaceholderText('生成中.')).toBeInTheDocument();
  });

  it('keeps the stop button visible while a task is still running', () => {
    render(<ChatInput onSend={() => {}} onStop={() => {}} taskRunning />);

    expect(screen.getByTitle('停止')).toBeInTheDocument();
  });
});
