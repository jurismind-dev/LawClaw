import { describe, expect, it } from 'vitest';
import { selectGatewayRuntime } from '@electron/gateway/runtime-selection';

describe('gateway runtime selection', () => {
  it('uses Electron runtime when built entry exists in development', () => {
    const runtime = selectGatewayRuntime({
      appIsPackaged: false,
      hasBuiltEntry: true,
      electronExecPath: 'C:\\mock\\electron.exe',
    });

    expect(runtime).toEqual({
      command: 'C:\\mock\\electron.exe',
      mode: 'dev-built',
      useElectronRunAsNode: true,
    });
  });

  it('falls back to pnpm dev when built entry is unavailable', () => {
    const runtime = selectGatewayRuntime({
      appIsPackaged: false,
      hasBuiltEntry: false,
      electronExecPath: 'C:\\mock\\electron.exe',
    });

    expect(runtime).toEqual({
      command: 'pnpm',
      mode: 'dev-pnpm',
      useElectronRunAsNode: false,
    });
  });

  it('uses Electron runtime in packaged mode', () => {
    const runtime = selectGatewayRuntime({
      appIsPackaged: true,
      hasBuiltEntry: true,
      electronExecPath: '/Applications/ClawX.app/Contents/MacOS/ClawX Helper',
    });

    expect(runtime).toEqual({
      command: '/Applications/ClawX.app/Contents/MacOS/ClawX Helper',
      mode: 'packaged',
      useElectronRunAsNode: true,
    });
  });
});
