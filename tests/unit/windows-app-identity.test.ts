import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8');
}

describe('windows app identity', () => {
  it('keeps LawClaw on its own Windows app id across build and runtime', () => {
    const builderConfig = readRepoFile('electron-builder.yml');
    const mainProcess = readRepoFile('electron/main/index.ts');
    const macWatcher = readRepoFile('electron/utils/mac-uninstall-watcher.ts');

    expect(builderConfig).toContain('appId: app.lawclaw.desktop');
    expect(builderConfig).not.toContain('appId: app.clawx.desktop');

    expect(mainProcess).toContain("const WINDOWS_APP_USER_MODEL_ID = 'app.lawclaw.desktop';");
    expect(mainProcess).not.toContain("const WINDOWS_APP_USER_MODEL_ID = 'app.clawx.desktop';");

    expect(macWatcher).toContain("const APP_ID = 'app.lawclaw.desktop';");
    expect(macWatcher).not.toContain("const APP_ID = 'app.clawx.desktop';");
  });
});
