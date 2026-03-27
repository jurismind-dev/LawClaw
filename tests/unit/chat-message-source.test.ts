import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('chat message source guard', () => {
  it('keeps user and assistant text bubbles on the same neutral background', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/Chat/ChatMessage.tsx'), 'utf8');

    expect(source).toContain("rounded-full bg-muted text-foreground");
    expect(source).toContain("? 'bg-muted text-foreground'");
    expect(source).not.toContain('rounded-full bg-primary text-primary-foreground');
    expect(source).not.toContain("? 'bg-primary text-primary-foreground'");
  });
});
