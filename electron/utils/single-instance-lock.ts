import { lstatSync, readlinkSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';

const SINGLETON_ARTIFACT_NAMES = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'] as const;

export interface SingletonCleanupResult {
  stalePid: number | null;
  removedArtifacts: string[];
}

interface SingletonCleanupOptions {
  isPidRunning?: (pid: number) => boolean;
}

export function parseSingletonLockPid(lockTarget: string): number | null {
  const match = /-(\d+)$/.exec(basename(lockTarget.trim()));
  if (!match) {
    return null;
  }

  const pid = Number.parseInt(match[1], 10);
  return Number.isFinite(pid) ? pid : null;
}

export function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    return code === 'EPERM';
  }
}

export function cleanupStaleSingletonArtifacts(
  userDataPath: string,
  options: SingletonCleanupOptions = {}
): SingletonCleanupResult {
  if (process.platform === 'win32') {
    return { stalePid: null, removedArtifacts: [] };
  }

  const lockPath = join(userDataPath, 'SingletonLock');

  try {
    if (!lstatSync(lockPath).isSymbolicLink()) {
      return { stalePid: null, removedArtifacts: [] };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { stalePid: null, removedArtifacts: [] };
    }
    throw error;
  }

  const lockTarget = (() => {
    try {
      return readlinkSync(lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  })();

  if (!lockTarget) {
    return { stalePid: null, removedArtifacts: [] };
  }

  const stalePid = parseSingletonLockPid(lockTarget);
  if (!stalePid) {
    return { stalePid: null, removedArtifacts: [] };
  }

  const probePid = options.isPidRunning ?? isPidRunning;
  if (probePid(stalePid)) {
    return { stalePid: null, removedArtifacts: [] };
  }

  const removedArtifacts: string[] = [];
  for (const name of SINGLETON_ARTIFACT_NAMES) {
    const artifactPath = join(userDataPath, name);
    try {
      rmSync(artifactPath, { force: true });
      removedArtifacts.push(artifactPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return {
    stalePid,
    removedArtifacts,
  };
}
