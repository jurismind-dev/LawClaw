import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8');
}

describe('bundled openclaw CLI wrappers', () => {
  it('point to the LawClaw executables instead of legacy ClawX names', () => {
    const posixWrapper = readRepoFile('resources/cli/posix/openclaw');
    const windowsCmdWrapper = readRepoFile('resources/cli/win32/openclaw.cmd');
    const windowsShWrapper = readRepoFile('resources/cli/win32/openclaw');

    expect(posixWrapper).toContain('MacOS/LawClaw');
    expect(posixWrapper).toContain('INSTALL_DIR/lawclaw');
    expect(posixWrapper).not.toContain('ClawX');

    expect(windowsCmdWrapper).toContain('LawClaw.exe');
    expect(windowsCmdWrapper).not.toContain('ClawX.exe');

    expect(windowsShWrapper).toContain('LawClaw.exe');
    expect(windowsShWrapper).not.toContain('ClawX.exe');
  });

  it('adds the bundled CLI directory to the Windows installer PATH hook', () => {
    const installerScript = readRepoFile('scripts/installer.nsh');

    expect(installerScript).toContain('!macro customInstall');
    expect(installerScript).toContain('$INSTDIR\\\\resources\\\\cli');
  });
});
