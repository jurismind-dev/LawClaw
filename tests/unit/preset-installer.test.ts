import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PresetInstaller } from '../../electron/utils/preset-installer';
import { readPresetInstallState } from '../../electron/utils/preset-install-state';

interface TestContext {
  rootDir: string;
  resourcesDir: string;
  presetRootDir: string;
  clawXConfigDir: string;
  openClawConfigDir: string;
  openClawSkillsDir: string;
  pluginInstallCalls: string[];
  pluginUninstallCalls: string[];
  installer: PresetInstaller;
}

interface ArtifactInfo {
  path: string;
  sha256: string;
}

const createdRoots: string[] = [];

function createContext(): TestContext {
  const rootDir = mkdtempSync(join(tmpdir(), 'lawclaw-preset-installer-'));
  createdRoots.push(rootDir);

  const resourcesDir = join(rootDir, 'resources');
  const presetRootDir = join(resourcesDir, 'preset-installs');
  const clawXConfigDir = join(rootDir, '.LawClaw');
  const openClawConfigDir = join(rootDir, '.openclaw');
  const openClawSkillsDir = join(openClawConfigDir, 'skills');
  mkdirSync(presetRootDir, { recursive: true });
  mkdirSync(openClawSkillsDir, { recursive: true });

  const pluginInstallCalls: string[] = [];
  const pluginUninstallCalls: string[] = [];

  const installer = new PresetInstaller({
    resourcesDir,
    clawXConfigDir,
    openClawConfigDir,
    openClawSkillsDir,
    installPluginFromLocalPath: async (pluginId, installPath) => {
      pluginInstallCalls.push(pluginId);
      const targetDir = join(openClawConfigDir, 'extensions', pluginId);
      rmSync(targetDir, { recursive: true, force: true });
      mkdirSync(targetDir, { recursive: true });
      cpSync(installPath, targetDir, { recursive: true, dereference: true });
      return { success: true };
    },
    uninstallPlugin: async (pluginId) => {
      pluginUninstallCalls.push(pluginId);
      const targetDir = join(openClawConfigDir, 'extensions', pluginId);
      rmSync(targetDir, { recursive: true, force: true });
      return { success: true };
    },
  });

  return {
    rootDir,
    resourcesDir,
    presetRootDir,
    clawXConfigDir,
    openClawConfigDir,
    openClawSkillsDir,
    pluginInstallCalls,
    pluginUninstallCalls,
    installer,
  };
}

function collectFiles(rootDir: string, currentDir = rootDir, files: string[] = []): string[] {
  for (const dirent of readdirSync(currentDir, { withFileTypes: true })) {
    const fullPath = join(currentDir, dirent.name);
    if (dirent.isDirectory()) {
      collectFiles(rootDir, fullPath, files);
      continue;
    }
    if (dirent.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function computeDirectoryHash(dirPath: string): string {
  const files = collectFiles(dirPath).sort((a, b) => a.localeCompare(b));
  const hash = createHash('sha256');
  for (const filePath of files) {
    const rel = relative(dirPath, filePath).replaceAll('\\', '/');
    hash.update(rel, 'utf-8');
    hash.update('\n', 'utf-8');
    hash.update(readFileSync(filePath));
    hash.update('\n', 'utf-8');
  }
  return hash.digest('hex');
}

function createDirArtifact(context: TestContext, relativePath: string, pkgName: string, version: string): ArtifactInfo {
  const artifactPath = join(context.presetRootDir, relativePath);
  mkdirSync(artifactPath, { recursive: true });
  writeFileSync(
    join(artifactPath, 'package.json'),
    JSON.stringify({ name: pkgName, version }, null, 2),
    'utf-8'
  );
  writeFileSync(join(artifactPath, 'README.md'), `${pkgName}@${version}`, 'utf-8');
  return {
    path: relativePath.replaceAll('\\', '/'),
    sha256: computeDirectoryHash(artifactPath),
  };
}

function writeManifest(
  context: TestContext,
  args: {
    presetVersion: string;
    items: Array<{
      kind: 'skill' | 'plugin';
      id: string;
      targetVersion: string;
      artifactPath: string;
      sha256: string;
      displayName?: string;
      installMode?: 'dir' | 'tgz';
    }>;
  }
): void {
  writeFileSync(
    join(context.presetRootDir, 'manifest.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        presetVersion: args.presetVersion,
        items: args.items,
      },
      null,
      2
    ),
    'utf-8'
  );
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

function getClawHubOriginPath(context: TestContext, skillId: string): string {
  return join(context.openClawSkillsDir, skillId, '.clawhub', 'origin.json');
}

function getClawHubLockPath(context: TestContext): string {
  return join(context.openClawConfigDir, '.clawhub', 'lock.json');
}

afterEach(() => {
  const envBackup = process.env.__TEST_FORCE_PRESET_SYNC_BACKUP;
  if (envBackup === undefined) {
    delete process.env.FORCE_PRESET_SYNC;
  } else {
    process.env.FORCE_PRESET_SYNC = envBackup;
  }
  delete process.env.__TEST_FORCE_PRESET_SYNC_BACKUP;

  while (createdRoots.length > 0) {
    const root = createdRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('PresetInstaller', () => {
  it('首装 bootstrap 全成功并写入状态', async () => {
    const context = createContext();
    const skillArtifact = createDirArtifact(context, 'skills/base-skill', 'base-skill', '1.0.0');
    writeManifest(context, {
      presetVersion: '2026.03.04.1',
      items: [
        {
          kind: 'skill',
          id: 'base-skill',
          displayName: 'Base Skill',
          targetVersion: '1.0.0',
          artifactPath: skillArtifact.path,
          sha256: skillArtifact.sha256,
          installMode: 'dir',
        },
      ],
    });

    const statusBefore = context.installer.getStatus();
    expect(statusBefore.pending).toBe(true);
    expect(statusBefore.blockedReason).toBe('needs-run');

    const result = await context.installer.run('setup');
    expect(result.success).toBe(true);
    expect(result.installed).toEqual(['skill:base-skill']);
    expect(result.skippedItems).toEqual([]);

    const statusAfter = context.installer.getStatus();
    expect(statusAfter.pending).toBe(false);
    expect(statusAfter.lastResult?.status).toBe('success');
    expect(existsSync(join(context.openClawSkillsDir, 'base-skill', 'package.json'))).toBe(true);

    const origin = readJson<{
      version: number;
      registry: string;
      slug: string;
      installedVersion: string;
      installedAt: number;
    }>(getClawHubOriginPath(context, 'base-skill'));
    expect(origin.version).toBe(1);
    expect(origin.registry).toBe('https://lawhub.jurismind.com');
    expect(origin.slug).toBe('base-skill');
    expect(origin.installedVersion).toBe('1.0.0');
    expect(typeof origin.installedAt).toBe('number');

    const lock = readJson<{ version: number; skills: Record<string, { version: string; installedAt: number }> }>(
      getClawHubLockPath(context)
    );
    expect(lock.version).toBe(1);
    expect(lock.skills['base-skill']).toMatchObject({ version: '1.0.0' });
  });

  it('升级时 manifest hash 变化会触发 pending', async () => {
    const context = createContext();
    const skillArtifact = createDirArtifact(context, 'skills/base-skill', 'base-skill', '1.0.0');

    writeManifest(context, {
      presetVersion: '2026.03.04.1',
      items: [
        {
          kind: 'skill',
          id: 'base-skill',
          targetVersion: '1.0.0',
          artifactPath: skillArtifact.path,
          sha256: skillArtifact.sha256,
          installMode: 'dir',
        },
      ],
    });
    await context.installer.run('setup');
    expect(context.installer.getStatus().pending).toBe(false);

    writeManifest(context, {
      presetVersion: '2026.03.05.1',
      items: [
        {
          kind: 'skill',
          id: 'base-skill',
          targetVersion: '1.0.0',
          artifactPath: skillArtifact.path,
          sha256: skillArtifact.sha256,
          installMode: 'dir',
        },
      ],
    });

    const status = context.installer.getStatus();
    expect(status.pending).toBe(true);
    expect(status.blockedReason).toBe('needs-run');
  });

  it('失败后 retry 成功会解除阻塞', async () => {
    const context = createContext();
    const skillArtifact = createDirArtifact(context, 'skills/retry-skill', 'retry-skill', '1.0.0');

    writeManifest(context, {
      presetVersion: '2026.03.06.1',
      items: [
        {
          kind: 'skill',
          id: 'retry-skill',
          targetVersion: '1.0.0',
          artifactPath: skillArtifact.path,
          sha256: '0'.repeat(64),
          installMode: 'dir',
        },
      ],
    });

    const failed = await context.installer.run('upgrade');
    expect(failed.success).toBe(false);
    expect(failed.error).toContain('SHA256 mismatch');
    expect(context.installer.getStatus().pending).toBe(true);

    writeManifest(context, {
      presetVersion: '2026.03.07.1',
      items: [
        {
          kind: 'skill',
          id: 'retry-skill',
          targetVersion: '1.0.0',
          artifactPath: skillArtifact.path,
          sha256: skillArtifact.sha256,
          installMode: 'dir',
        },
      ],
    });

    const retried = await context.installer.retry('upgrade');
    expect(retried.success).toBe(true);
    expect(context.installer.getStatus().pending).toBe(false);
  });

  it('skip 当前版本后不再阻塞', async () => {
    const context = createContext();
    const skillArtifact = createDirArtifact(context, 'skills/skip-skill', 'skip-skill', '1.0.0');
    writeManifest(context, {
      presetVersion: '2026.03.08.1',
      items: [
        {
          kind: 'skill',
          id: 'skip-skill',
          targetVersion: '1.0.0',
          artifactPath: skillArtifact.path,
          sha256: skillArtifact.sha256,
          installMode: 'dir',
        },
      ],
    });

    expect(context.installer.getStatus().pending).toBe(true);
    const skippedStatus = context.installer.skipCurrentVersion();
    expect(skippedStatus.pending).toBe(false);
    expect(skippedStatus.lastResult?.status).toBe('skipped');

    const runResult = await context.installer.run('upgrade');
    expect(runResult.success).toBe(true);
    expect(runResult.skipped).toBe(true);
  });

  it('仅升级不降级：已存在高版本 skill 会跳过', async () => {
    const context = createContext();
    const skillDir = join(context.openClawSkillsDir, 'versioned-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'package.json'),
      JSON.stringify({ name: 'versioned-skill', version: '2.0.0' }, null, 2),
      'utf-8'
    );

    const artifact = createDirArtifact(context, 'skills/versioned-skill', 'versioned-skill', '1.0.0');
    writeManifest(context, {
      presetVersion: '2026.03.09.1',
      items: [
        {
          kind: 'skill',
          id: 'versioned-skill',
          targetVersion: '1.0.0',
          artifactPath: artifact.path,
          sha256: artifact.sha256,
          installMode: 'dir',
        },
      ],
    });

    const result = await context.installer.run('upgrade');
    expect(result.success).toBe(true);
    expect(result.skippedItems).toContain('skill:versioned-skill');
    const installedPkg = JSON.parse(readFileSync(join(skillDir, 'package.json'), 'utf-8')) as {
      version: string;
    };
    expect(installedPkg.version).toBe('2.0.0');
  });

  it('FORCE_PRESET_SYNC 会严格对齐并清理已托管旧插件', async () => {
    const context = createContext();
    process.env.__TEST_FORCE_PRESET_SYNC_BACKUP = process.env.FORCE_PRESET_SYNC;
    process.env.FORCE_PRESET_SYNC = 'true';

    const skillArtifact = createDirArtifact(context, 'skills/force-skill', 'force-skill', '1.0.0');
    const pluginArtifact = createDirArtifact(context, 'plugins/force-plugin', 'force-plugin', '1.0.0');
    writeManifest(context, {
      presetVersion: '2026.03.10.1',
      items: [
        {
          kind: 'skill',
          id: 'force-skill',
          targetVersion: '1.0.0',
          artifactPath: skillArtifact.path,
          sha256: skillArtifact.sha256,
          installMode: 'dir',
        },
        {
          kind: 'plugin',
          id: 'force-plugin',
          targetVersion: '1.0.0',
          artifactPath: pluginArtifact.path,
          sha256: pluginArtifact.sha256,
          installMode: 'dir',
        },
      ],
    });
    await context.installer.run('upgrade');
    expect(context.pluginInstallCalls).toContain('force-plugin');

    writeManifest(context, {
      presetVersion: '2026.03.11.1',
      items: [
        {
          kind: 'skill',
          id: 'force-skill',
          targetVersion: '1.0.0',
          artifactPath: skillArtifact.path,
          sha256: skillArtifact.sha256,
          installMode: 'dir',
        },
      ],
    });

    await context.installer.run('upgrade');
    expect(context.pluginUninstallCalls).toContain('force-plugin');
    expect(existsSync(join(context.openClawConfigDir, 'extensions', 'force-plugin'))).toBe(false);

    const state = readPresetInstallState(context.clawXConfigDir);
    expect(state.managedItems['plugin:force-plugin']).toBeUndefined();
  });

  it('FORCE_PRESET_SYNC 清理旧 skill 时会同步清理 clawhub lock', async () => {
    const context = createContext();
    process.env.__TEST_FORCE_PRESET_SYNC_BACKUP = process.env.FORCE_PRESET_SYNC;
    process.env.FORCE_PRESET_SYNC = 'true';

    const skillArtifact = createDirArtifact(context, 'skills/force-cleanup-skill', 'force-cleanup-skill', '1.0.0');
    writeManifest(context, {
      presetVersion: '2026.03.12.1',
      items: [
        {
          kind: 'skill',
          id: 'force-cleanup-skill',
          targetVersion: '1.0.0',
          artifactPath: skillArtifact.path,
          sha256: skillArtifact.sha256,
          installMode: 'dir',
        },
      ],
    });

    await context.installer.run('upgrade');
    const lockBefore = readJson<{ skills: Record<string, { version: string; installedAt: number }> }>(
      getClawHubLockPath(context)
    );
    expect(lockBefore.skills['force-cleanup-skill']).toBeTruthy();
    expect(existsSync(join(context.openClawSkillsDir, 'force-cleanup-skill'))).toBe(true);

    writeManifest(context, {
      presetVersion: '2026.03.13.1',
      items: [],
    });

    await context.installer.run('upgrade');

    const lockAfter = readJson<{ skills: Record<string, { version: string; installedAt: number }> }>(
      getClawHubLockPath(context)
    );
    expect(lockAfter.skills['force-cleanup-skill']).toBeUndefined();
    expect(existsSync(join(context.openClawSkillsDir, 'force-cleanup-skill'))).toBe(false);
  });

  it('SHA256 不匹配时返回失败并写入 failed 状态', async () => {
    const context = createContext();
    const artifact = createDirArtifact(context, 'skills/hash-skill', 'hash-skill', '1.0.0');
    writeManifest(context, {
      presetVersion: '2026.03.12.1',
      items: [
        {
          kind: 'skill',
          id: 'hash-skill',
          targetVersion: '1.0.0',
          artifactPath: artifact.path,
          sha256: 'f'.repeat(64),
          installMode: 'dir',
        },
      ],
    });

    const result = await context.installer.run('setup');
    expect(result.success).toBe(false);
    expect(result.error).toContain('SHA256 mismatch');

    const status = context.installer.getStatus();
    expect(status.pending).toBe(true);
    expect(status.lastResult?.status).toBe('failed');
  });
});
