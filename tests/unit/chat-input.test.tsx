import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
});
