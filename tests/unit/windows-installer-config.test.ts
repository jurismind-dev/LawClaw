import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('windows installer config', () => {
  it('keeps the NSIS install directory fixed for users', () => {
    const source = readFileSync(join(process.cwd(), 'electron-builder.yml'), 'utf-8');

    expect(source).toContain('appId: app.lawclaw.desktop');
    expect(source).toContain('nsis:');
    expect(source).toContain('guid: 509c62e4-d3e7-5e20-aa66-d59894dcca47');
    expect(source).toContain('oneClick: false');
    expect(source).toContain('allowToChangeInstallationDirectory: false');
    expect(source).not.toContain('allowToChangeInstallationDirectory: true');
  });

  it('keeps the custom NSIS upgrade safety macros wired in', () => {
    const source = readFileSync(join(process.cwd(), 'scripts/installer.nsh'), 'utf-8');

    expect(source).toContain('ShowInstDetails hide');
    expect(source).toContain('ShowUninstDetails hide');
    expect(source).toContain('SetDetailsPrint none');
    expect(source).not.toContain('SetDetailsPrint both');
    expect(source).toContain('!macro customCheckAppRunning');
    expect(source).toContain('!macro customInit');
    expect(source).toContain('!macro customUnInstallCheck');
    expect(source).toContain('!macro customUnInstallCheckCurrentUser');
    expect(source).toContain('LAWCLAW_LEGACY_SHARED_APP_GUID');
    expect(source).toContain('DetectLegacyLawClawSharedRegistry');
    expect(source).toContain('DeleteRegKey HKCU "${LAWCLAW_LEGACY_SHARED_UNINSTALL_REGISTRY_KEY}"');
    expect(source).toContain('DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString');
    expect(source).toContain('Rename "$INSTDIR" "$INSTDIR._stale_$R8"');
    expect(source).toContain('ReadRegStr $R9 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation');
    expect(source).toContain("nsExec::ExecToStack 'taskkill /F /IM crashpad_handler.exe'");
  });
});
