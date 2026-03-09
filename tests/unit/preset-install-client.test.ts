import { describe, expect, it, vi } from 'vitest';
import { invokePresetInstallRun } from '@/lib/preset-install-client';

describe('invokePresetInstallRun', () => {
  it('returns IPC result when preset install invoke succeeds', async () => {
    const invoke = vi.fn(async () => ({
      success: true,
      installed: ['skill:contract-review-jurismind'],
      skippedItems: [],
    }));

    const result = await invokePresetInstallRun(invoke, 'run', 'upgrade');

    expect(result).toEqual({
      success: true,
      installed: ['skill:contract-review-jurismind'],
      skippedItems: [],
    });
    expect(invoke).toHaveBeenCalledWith('presetInstall:run', { phase: 'upgrade' });
  });

  it('converts IPC rejection into a failed install result', async () => {
    const invoke = vi.fn(async () => {
      throw new Error('manifest not found');
    });

    const result = await invokePresetInstallRun(invoke, 'retry', 'upgrade');

    expect(result).toEqual({
      success: false,
      installed: [],
      skippedItems: [],
      error: 'manifest not found',
    });
    expect(invoke).toHaveBeenCalledWith('presetInstall:retry', { phase: 'upgrade' });
  });
});
