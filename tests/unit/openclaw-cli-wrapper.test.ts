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
    expect(windowsCmdWrapper).toContain('chcp 65001');
    expect(windowsCmdWrapper).not.toContain('ClawX.exe');

    expect(windowsShWrapper).toContain('LawClaw.exe');
    expect(windowsShWrapper).not.toContain('ClawX.exe');
  });

  it('adds the bundled CLI directory to the Windows installer PATH hook', () => {
    const installerScript = readRepoFile('scripts/installer.nsh');

    expect(installerScript).toContain('!macro customInstall');
    expect(installerScript).toContain('$INSTDIR\\\\resources\\\\cli');
    expect(installerScript).toContain('PendingCliPath');
    expect(installerScript).toContain("Get-ItemProperty -Path $$key -ErrorAction SilentlyContinue");
  });

  it('keeps Windows plugin installation off npm.cmd fallbacks', () => {
    const afterPackScript = readRepoFile('scripts/after-pack.cjs');
    const bundleScript = readRepoFile('scripts/bundle-openclaw.mjs');
    const devScript = readRepoFile('scripts/dev.mjs');
    const devSetupScript = readRepoFile('scripts/dev-setup.mjs');
    const openClawCliSource = readRepoFile('electron/utils/openclaw-cli.ts');
    const bundledRuntimeSource = readRepoFile('electron/utils/bundled-runtime.ts');
    const feishuOnboardingSource = readRepoFile('electron/utils/feishu-onboarding.ts');
    const ipcHandlersSource = readRepoFile('electron/main/ipc-handlers.ts');
    const gatewayManagerSource = readRepoFile('electron/gateway/manager.ts');

    expect(afterPackScript).toContain("join(appOutDir, 'node_modules', 'npm')");
    expect(afterPackScript).toContain('Bundled npm runtime for Windows');
    expect(afterPackScript).toContain("join(resourcesDir, 'npm-runtime', 'node_modules', 'npm')");
    expect(afterPackScript).toContain('Bundled npm runtime for POSIX');
    expect(afterPackScript).toContain('patchOpenClawWindowsSpawnRuntime');
    expect(bundleScript).toContain('patchOpenClawWindowsSpawnRuntime');
    expect(devScript).toContain('patchOpenClawWindowsSpawnRuntime');
    expect(devSetupScript).toContain('patchOpenClawWindowsSpawnRuntime');
    expect(bundleScript).toContain('patchOpenClawKillTreeRuntime');
    expect(devScript).toContain('patchOpenClawKillTreeRuntime');
    expect(devSetupScript).toContain('patchOpenClawKillTreeRuntime');
    expect(afterPackScript).toContain('patchOpenClawKillTreeRuntime');
    expect(bundleScript).toContain('patchOpenClawModelCatalogRuntime');
    expect(devScript).toContain('patchOpenClawModelCatalogRuntime');
    expect(devSetupScript).toContain('patchOpenClawModelCatalogRuntime');
    expect(afterPackScript).toContain('patchOpenClawModelCatalogRuntime');

    expect(openClawCliSource).toContain('process.env.npm_node_execpath');
    expect(openClawCliSource).toContain('export function getNodeExecForCli');
    expect(openClawCliSource).toContain('export function applyBundledNpmToCliEnv');
    expect(openClawCliSource).toContain("join(process.resourcesPath, 'npm-bin')");
    expect(openClawCliSource).toContain('applyBundledRuntimeToEnv');
    expect(bundledRuntimeSource).toContain('LAWCLAW_BUNDLED_NODE_EXE');
    expect(bundledRuntimeSource).toContain('LAWCLAW_BUNDLED_UV_EXE');
    expect(bundledRuntimeSource).toContain("join(systemRoot, 'System32')");
    expect(bundledRuntimeSource).toContain("env.Path = nextPath");
    expect(feishuOnboardingSource).toContain('const commandEnv = applyBundledNpmToCliEnv({ ...process.env });');
    expect(ipcHandlersSource).toContain('const commandEnv = applyBundledNpmToCliEnv({ ...process.env });');
    expect(gatewayManagerSource).toContain('const commandEnv = applyBundledNpmToCliEnv({ ...process.env });');
  });

  it('ships runtime-bridge wrappers for node, npm, and managed python', () => {
    const builderConfig = readRepoFile('electron-builder.yml');
    const posixNode = readRepoFile('resources/runtime-bridge/posix/node');
    const posixPython = readRepoFile('resources/runtime-bridge/posix/python');
    const windowsCmdUtf8 = readRepoFile('resources/runtime-bridge/win32/cmd-utf8.cmd');
    const windowsNode = readRepoFile('resources/runtime-bridge/win32/node.cmd');
    const windowsPython = readRepoFile('resources/runtime-bridge/win32/python.cmd');
    const windowsPythonBridge = readRepoFile('resources/runtime-bridge/win32/python-bridge.ps1');

    expect(builderConfig).toContain('resources/runtime-bridge/posix/');
    expect(builderConfig).toContain('resources/runtime-bridge/win32/');

    expect(posixNode).toContain('LAWCLAW_BUNDLED_NODE_EXE');
    expect(posixNode).toContain('ELECTRON_RUN_AS_NODE=1');
    expect(posixPython).toContain('python find 3.12');
    expect(posixPython).toContain('python install 3.12');
    expect(posixPython).toContain('VENV_DIR="$HOME/.LawClaw/support/managed-python/3.12/');
    expect(posixPython).toContain('venv --no-project --clear --python "$BASE_PYTHON_EXE" "$VENV_DIR"');
    expect(posixPython).toContain('pip install --python "$VENV_PYTHON_EXE" --strict python-docx openpyxl lxml defusedxml');
    expect(posixPython).toContain('modules = ["docx", "openpyxl", "lxml", "defusedxml"]');

    expect(windowsCmdUtf8).toContain('chcp 65001');
    expect(windowsCmdUtf8).toContain('cmd.exe');
    expect(windowsNode).toContain('LAWCLAW_BUNDLED_NODE_EXE');
    expect(windowsNode).toContain('ELECTRON_RUN_AS_NODE=1');
    expect(windowsNode).toContain('PYTHONIOENCODING=utf-8');
    expect(windowsPython).toContain('python-bridge.ps1');
    expect(windowsPython).toContain('%~dp0python-bridge.ps1');
    expect(windowsPython).not.toContain('for /f "usebackq delims="');
    expect(windowsPython).toContain('PYTHONUTF8=1');
    expect(windowsPythonBridge).toContain('& $UvExe python find 3.12');
    expect(windowsPythonBridge).toContain('& $UvExe python install 3.12');
    expect(windowsPythonBridge).toContain('Test-IsWindowsMinorLinkError');
    expect(windowsPythonBridge).toContain('Get-WindowsMinorLinkCleanupPaths');
    expect(windowsPythonBridge).toContain('Invoke-ManagedPythonInstall');
    expect(windowsPythonBridge).toContain('Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop');
    expect(windowsPythonBridge).toContain("return Join-Path $HOME '.LawClaw\\support\\managed-python\\3.12\\win32'");
    expect(windowsPythonBridge).toContain('& $uvExe venv --no-project --clear --python $basePythonExe (Get-ManagedPythonVenvRoot)');
    expect(windowsPythonBridge).toContain('& $uvExe pip install --python $pythonExe --strict python-docx openpyxl lxml defusedxml pywin32');
    expect(windowsPythonBridge).toContain('modules = ["docx", "openpyxl", "lxml", "defusedxml", "pythoncom", "win32com.client"]');
    expect(windowsPythonBridge).toContain('& $pythonExe @PythonArgs');
    expect(windowsPythonBridge).toContain('[Console]::OutputEncoding');
  });

  it('patches bundled packages that still need require() compatibility', () => {
    const bundleScript = readRepoFile('scripts/bundle-openclaw.mjs');
    const afterPackScript = readRepoFile('scripts/after-pack.cjs');
    const devScript = readRepoFile('scripts/dev.mjs');
    const devSetupScript = readRepoFile('scripts/dev-setup.mjs');
    const compatScript = readRepoFile('scripts/openclaw-bundle-compat.cjs');

    expect(bundleScript).toContain('patchOpenClawBundleCompat');
    expect(bundleScript).toContain('patchOpenClawExecRuntime');
    expect(bundleScript).toContain('patchOpenClawPluginSdkCompat');
    expect(afterPackScript).toContain('patchOpenClawBundleCompat');
    expect(afterPackScript).toContain('patchOpenClawExecRuntime');
    expect(afterPackScript).toContain('patchOpenClawPluginSdkCompat');
    expect(devScript).toContain('patchOpenClawExecRuntime');
    expect(devScript).toContain('patchOpenClawPluginSdkCompat');
    expect(devSetupScript).toContain('patchOpenClawExecRuntime');
    expect(devSetupScript).toContain('patchOpenClawPluginSdkCompat');
    expect(bundleScript).toContain('patchOpenClawModelCatalogRuntime');
    expect(afterPackScript).toContain('patchOpenClawModelCatalogRuntime');
    expect(devScript).toContain('patchOpenClawModelCatalogRuntime');
    expect(devSetupScript).toContain('patchOpenClawModelCatalogRuntime');
    expect(compatScript).toContain('https-proxy-agent');
    expect(compatScript).toContain('plugin-sdk compat patch v1');
    expect(compatScript).toContain('lawclaw windows exec powershell utf8 patch v1');
    expect(compatScript).toContain('lawclaw windows kill-tree patch v1');
    expect(compatScript).toContain('lawclaw model discovery fallback patch v1');
    expect(compatScript).toContain('lawclaw model catalog runtime fallback patch v1');
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
    expect(builderWrapper).toContain("process.env.LAWCLAW_MAC_SIGN === '0'");
    expect(builderWrapper).toContain('electron-builder.nosign.yml');
  });
});
