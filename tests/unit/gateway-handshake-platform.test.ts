import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8');
}

describe('gateway manager handshake identity', () => {
  it('keeps the LawClaw desktop backend identity stable to avoid metadata re-pairing', () => {
    const source = readRepoFile('electron/gateway/manager.ts');

    expect(source).toContain("const clientMode = 'backend'");
    expect(source).toContain("platform: 'desktop'");
    expect(source).toContain("const scopes = ['operator.admin', 'operator.approvals', 'operator.pairing']");
    expect(source).toContain('pairing-required metadata upgrade');
  });
});
