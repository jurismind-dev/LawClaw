import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('windows installer config', () => {
  it('keeps the NSIS install directory fixed for users', () => {
    const source = readFileSync(join(process.cwd(), 'electron-builder.yml'), 'utf-8');

    expect(source).toContain('nsis:');
    expect(source).toContain('oneClick: false');
    expect(source).toContain('allowToChangeInstallationDirectory: false');
    expect(source).not.toContain('allowToChangeInstallationDirectory: true');
  });
});
