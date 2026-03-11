import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readAppSource(): string {
  return readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf-8');
}

describe('app setup provider guard', () => {
  it('re-enters setup when the persisted setup flag exists but no providers remain', () => {
    const source = readAppSource();

    expect(source).toContain("window.electron.ipcRenderer.invoke('provider:list')");
    expect(source).toContain('providers.length === 0');
    expect(source).toContain('markSetupIncomplete();');
  });
});
