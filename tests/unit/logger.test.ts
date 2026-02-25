import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: () => 'C:\\mock-user-data',
    getVersion: () => '0.0.0-test',
  },
}));

import { getRecentLogs, warn } from '@electron/utils/logger';

describe('logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not throw when console.warn fails with broken pipe', () => {
    const brokenPipe = Object.assign(new Error('broken pipe'), { code: 'EPIPE' });
    vi.spyOn(console, 'warn').mockImplementation(() => {
      throw brokenPipe;
    });

    expect(() => warn('gateway stderr line')).not.toThrow();
  });

  it('keeps writing warn logs to ring buffer even when console fails', () => {
    const before = getRecentLogs().length;
    const brokenPipe = Object.assign(new Error('broken pipe'), { code: 'EPIPE' });
    vi.spyOn(console, 'warn').mockImplementation(() => {
      throw brokenPipe;
    });

    warn('ring buffer check');
    const logs = getRecentLogs();

    expect(logs.length).toBe(before + 1);
    expect(logs.at(-1)).toContain('[WARN');
    expect(logs.at(-1)).toContain('ring buffer check');
  });
});
