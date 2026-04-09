import { mkdtempSync, mkdirSync, readlinkSync, symlinkSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupStaleSingletonArtifacts,
  parseSingletonLockPid,
} from '@electron/utils/single-instance-lock';

const tempDirs: string[] = [];

function createUserDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lawclaw-singleton-'));
  tempDirs.push(dir);
  return dir;
}

async function cleanupTempDirs(): Promise<void> {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
}

afterEach(async () => {
  await cleanupTempDirs();
});

describe('single instance lock helpers', () => {
  it('parses the PID from Chromium singleton lock targets', () => {
    expect(parseSingletonLockPid('Mac-11154')).toBe(11154);
    expect(parseSingletonLockPid('/tmp/scoped/Linux-42')).toBe(42);
    expect(parseSingletonLockPid('not-a-lock')).toBeNull();
  });

  it('removes stale singleton artifacts when the recorded PID is gone', () => {
    const userDataDir = createUserDataDir();
    const socketDir = join(userDataDir, 'scoped-dir');
    mkdirSync(socketDir);

    symlinkSync('Mac-424242', join(userDataDir, 'SingletonLock'));
    symlinkSync(join(socketDir, 'SingletonSocket'), join(userDataDir, 'SingletonSocket'));
    symlinkSync('424242-cookie', join(userDataDir, 'SingletonCookie'));

    const result = cleanupStaleSingletonArtifacts(userDataDir, {
      isPidRunning: () => false,
    });

    expect(result.stalePid).toBe(424242);
    expect(result.removedArtifacts).toHaveLength(3);
    expect(() => readlinkSync(join(userDataDir, 'SingletonLock'))).toThrow();
  });

  it('keeps singleton artifacts when the recorded PID is still alive', () => {
    const userDataDir = createUserDataDir();

    symlinkSync('Mac-5150', join(userDataDir, 'SingletonLock'));
    symlinkSync('/tmp/SingletonSocket', join(userDataDir, 'SingletonSocket'));
    symlinkSync('5150-cookie', join(userDataDir, 'SingletonCookie'));

    const result = cleanupStaleSingletonArtifacts(userDataDir, {
      isPidRunning: () => true,
    });

    expect(result.stalePid).toBeNull();
    expect(result.removedArtifacts).toEqual([]);
    expect(readlinkSync(join(userDataDir, 'SingletonLock'))).toBe('Mac-5150');
  });
});
