import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8');
}

describe('gateway manager handshake identity', () => {
  it('uses a stable desktop platform for the internal gateway client', () => {
    const source = readRepoFile('electron/gateway/manager.ts');

    expect(source).toContain("platform: 'desktop'");
    expect(source).toContain('metadata-upgrade re-approval flow');
  });
});
  fix(gateway): 修复内部握手触发 metadata-upgrade 配对问题