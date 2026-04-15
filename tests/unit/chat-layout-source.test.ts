import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('chat layout source guard', () => {
  it('keeps the fullscreen chat content fluid instead of locking it to a narrow fixed column', () => {
    const chatPageSource = readFileSync(resolve(process.cwd(), 'src/pages/Chat/index.tsx'), 'utf8');
    const chatInputSource = readFileSync(resolve(process.cwd(), 'src/pages/Chat/ChatInput.tsx'), 'utf8');

    expect(chatPageSource).toContain('className="flex h-full min-h-0 flex-col"');
    expect(chatPageSource).toContain('flex w-full justify-end');
    expect(chatPageSource).toContain('relative w-full rounded-lg');
    expect(chatPageSource).toContain("const { contentRef, scrollRef } = useStickToBottomInstant(currentSessionKey);");
    expect(chatPageSource).toContain('className="min-h-0 flex-1 overflow-hidden px-3 py-2"');
    expect(chatPageSource).toContain('ref={scrollRef}');
    expect(chatPageSource).toContain('className="h-full min-h-0 overflow-y-auto"');
    expect(chatPageSource).toContain('ref={contentRef}');
    expect(chatPageSource).toContain('w-full space-y-4');
    expect(chatPageSource).toContain('flex w-full items-center justify-between');
    expect(chatPageSource).not.toContain('const [shouldAutoScroll, setShouldAutoScroll] = useState(true);');
    expect(chatPageSource).not.toContain('onScroll={updateAutoScrollState}');
    expect(chatPageSource).not.toContain('if (!shouldAutoScroll) return;');
    expect(chatPageSource).not.toContain('messagesEndRef.current?.scrollIntoView');
    expect(chatPageSource).not.toContain("style={{ height: 'calc(100vh - 2.5rem)' }}");
    expect(chatPageSource).not.toContain('max-w-[64rem]');
    expect(chatInputSource).toContain('      <div className="w-full">');
    expect(chatInputSource).not.toContain('max-w-[64rem]');
  });
});
