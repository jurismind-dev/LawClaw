import type { PresetInstallPhase, PresetInstallRunResult } from '@/types/preset-install';

type PresetInstallInvoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

export async function invokePresetInstallRun(
  invoke: PresetInstallInvoke,
  mode: 'run' | 'retry',
  phase: PresetInstallPhase
): Promise<PresetInstallRunResult> {
  const channel = mode === 'retry' ? 'presetInstall:retry' : 'presetInstall:run';

  try {
    return (await invoke(channel, { phase })) as PresetInstallRunResult;
  } catch (error) {
    return {
      success: false,
      installed: [],
      skippedItems: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
