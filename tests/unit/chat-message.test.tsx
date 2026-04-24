import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import { ChatMessage } from '@/pages/Chat/ChatMessage';
import type { RawMessage } from '@/stores/chat';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('ChatMessage attachments', () => {
  it.each([
    ['tool-output.pdf', 'application/pdf', '/tmp/tool-output.pdf'],
    ['reply-reference.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '/tmp/reply-reference.docx'],
  ])('opens %s from the attachment card', (fileName, mimeType, filePath) => {
    const invoke = vi.mocked(window.electron.ipcRenderer.invoke);
    const message: RawMessage = {
      role: 'assistant',
      content: '处理完成，请查看附件。',
      _attachedFiles: [
        {
          fileName,
          mimeType,
          fileSize: 1024,
          preview: null,
          filePath,
          source: 'message-ref',
        },
      ],
    };

    render(<ChatMessage message={message} showThinking={false} />);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(escapeRegExp(fileName)) }));

    expect(invoke).toHaveBeenCalledWith('shell:openPath', filePath);
  });
});
