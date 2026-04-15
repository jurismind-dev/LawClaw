import { describe, expect, it } from 'vitest';
import {
  getDeferredRestartAction,
  shouldDeferRestart,
} from '@electron/gateway/process-policy';

describe('gateway process policy helpers', () => {
  it('defers restart while startup or reconnect is in progress', () => {
    expect(shouldDeferRestart({ state: 'starting', startLock: false })).toBe(true);
    expect(shouldDeferRestart({ state: 'reconnecting', startLock: false })).toBe(true);
    expect(shouldDeferRestart({ state: 'running', startLock: true })).toBe(true);
  });

  it('does not defer restart for stable states when no start lock', () => {
    expect(shouldDeferRestart({ state: 'running', startLock: false })).toBe(false);
    expect(shouldDeferRestart({ state: 'stopped', startLock: false })).toBe(false);
    expect(shouldDeferRestart({ state: 'error', startLock: false })).toBe(false);
  });

  it('executes deferred restart once lifecycle recovers', () => {
    expect(
      getDeferredRestartAction({
        hasPendingRestart: true,
        state: 'running',
        startLock: false,
        shouldReconnect: true,
      }),
    ).toBe('execute');
  });

  it('waits deferred restart while lifecycle is still busy', () => {
    expect(
      getDeferredRestartAction({
        hasPendingRestart: true,
        state: 'starting',
        startLock: false,
        shouldReconnect: true,
      }),
    ).toBe('wait');
  });

  it('drops deferred restart when reconnect is disabled', () => {
    expect(
      getDeferredRestartAction({
        hasPendingRestart: true,
        state: 'stopped',
        startLock: false,
        shouldReconnect: false,
      }),
    ).toBe('drop');
  });
});
