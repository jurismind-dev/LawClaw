export type GatewayLaunchMode = 'packaged' | 'dev-built' | 'dev-pnpm';

export interface GatewayRuntimeSelectionInput {
  appIsPackaged: boolean;
  hasBuiltEntry: boolean;
  electronExecPath: string;
}

export interface GatewayRuntimeSelection {
  command: string;
  mode: GatewayLaunchMode;
  useElectronRunAsNode: boolean;
}

export function selectGatewayRuntime(
  input: GatewayRuntimeSelectionInput
): GatewayRuntimeSelection {
  const { appIsPackaged, hasBuiltEntry, electronExecPath } = input;

  if (hasBuiltEntry) {
    return {
      command: electronExecPath,
      mode: appIsPackaged ? 'packaged' : 'dev-built',
      useElectronRunAsNode: true,
    };
  }

  return {
    command: 'pnpm',
    mode: 'dev-pnpm',
    useElectronRunAsNode: false,
  };
}
