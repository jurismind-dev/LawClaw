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

  it('keeps Windows plugin installation off npm.cmd fallbacks', () => {
    const afterPackScript = readRepoFile('scripts/after-pack.cjs');
    const openClawCliSource = readRepoFile('electron/utils/openclaw-cli.ts');

    expect(afterPackScript).toContain("join(appOutDir, 'node_modules', 'npm')");
    expect(afterPackScript).toContain('Bundled npm runtime for Windows');
    expect(afterPackScript).toContain("join(resourcesDir, 'npm-runtime', 'node_modules', 'npm')");
    expect(afterPackScript).toContain('Bundled npm runtime for POSIX');

    expect(openClawCliSource).toContain('process.env.npm_node_execpath');
    expect(openClawCliSource).toContain('export function getNodeExecForCli');
    expect(openClawCliSource).toContain('export function applyBundledNpmToCliEnv');
    expect(openClawCliSource).toContain("join(process.resourcesPath, 'npm-bin')");
  });

  it('patches bundled packages that still need require() compatibility', () => {
    const bundleScript = readRepoFile('scripts/bundle-openclaw.mjs');
    const afterPackScript = readRepoFile('scripts/after-pack.cjs');
    const compatScript = readRepoFile('scripts/openclaw-bundle-compat.cjs');

    expect(bundleScript).toContain('patchOpenClawBundleCompat');
    expect(afterPackScript).toContain('patchOpenClawBundleCompat');
    expect(compatScript).toContain('https-proxy-agent');
  });

  it('routes mac builds through the unsigned electron-builder wrapper', () => {
    const packageJson = JSON.parse(readRepoFile('package.json')) as {
      scripts: Record<string, string>;
    };
    const noSignConfig = readRepoFile('electron-builder.nosign.yml');
    const builderWrapper = readRepoFile('scripts/run-electron-builder.mjs');

    expect(packageJson.scripts.build).toContain('node scripts/run-electron-builder.mjs');
    expect(packageJson.scripts.package).toContain('node scripts/run-electron-builder.mjs');
    expect(packageJson.scripts.packageMac ?? packageJson.scripts['package:mac']).toContain(
      'node scripts/run-electron-builder.mjs --mac'
    );
    expect(packageJson.scripts.release).toContain('node scripts/run-electron-builder.mjs --publish always');

    expect(noSignConfig).toContain('macUnsigned: true');
    expect(builderWrapper).toContain("process.env.LAWCLAW_MAC_SIGN !== '1'");
    expect(builderWrapper).toContain('electron-builder.nosign.yml');
  });
});
