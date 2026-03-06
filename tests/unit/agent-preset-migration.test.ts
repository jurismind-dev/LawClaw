import { afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import {
  __resetAgentPresetMigrationTestHooks,
  __setAgentPresetMigrationTestHooks,
  getAgentPresetMigrationStatus,
  runAgentPresetStartupMigration,
  stopAgentPresetMigrationCoordinator,
} from '@electron/utils/agent-preset-migration';

interface FixtureContext {
  rootDir: string;
  resourcesDir: string;
  openclawDir: string;
  lawclawDir: string;
}

interface PresetVersionOptions {
  includeBoot?: boolean;
  omitAgentsSourceFile?: boolean;
}

const tempDirs: string[] = [];

function writeText(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
}

function readText(filePath: string): string {
  return readFileSync(filePath, 'utf-8');
}

function createFixture(): FixtureContext {
  const rootDir = mkdtempSync(join(tmpdir(), 'lawclaw-agent-preset-'));
  tempDirs.push(rootDir);

  const resourcesDir = join(rootDir, 'resources');
  const openclawDir = join(rootDir, '.openclaw');
  const lawclawDir = join(rootDir, '.LawClaw');

  writeText(join(openclawDir, 'openclaw.json'), '{}');

  return {
    rootDir,
    resourcesDir,
    openclawDir,
    lawclawDir,
  };
}

function writePresetVersion(
  fixture: FixtureContext,
  version: number,
  options: PresetVersionOptions = {}
): void {
  const presetRoot = join(fixture.resourcesDir, 'agent-presets');
  const templateRoot = join(presetRoot, 'template');
  rmSync(templateRoot, { recursive: true, force: true });

  const workspaceFiles: Array<{ agentId: string; source: string; target: string }> = [
    {
      agentId: 'lawclaw-main',
      source: 'workspaces/lawclaw-main/SOUL.md',
      target: 'SOUL.md',
    },
  ];

  workspaceFiles.push({
    agentId: 'lawclaw-main',
    source: 'workspaces/lawclaw-main/AGENTS.md',
    target: 'AGENTS.md',
  });

  if (options.includeBoot) {
    workspaceFiles.push({
      agentId: 'lawclaw-main',
      source: 'workspaces/lawclaw-main/BOOT.md',
      target: 'BOOT.md',
    });
  }

  writeText(
    join(presetRoot, 'manifest.json'),
    JSON.stringify(
      {
        schemaVersion: 2,
        templateRoot: 'template',
        workspaceFiles,
        configPatch: 'openclaw.patch.json',
      },
      null,
      2
    )
  );

  writeText(
    join(templateRoot, 'workspaces', 'lawclaw-main', 'SOUL.md'),
    `# SOUL v${version}\n\nThis is version ${version}.\n`
  );

  if (!options.omitAgentsSourceFile) {
    writeText(
      join(templateRoot, 'workspaces', 'lawclaw-main', 'AGENTS.md'),
      `# AGENTS v${version}\n`
    );
  }

  if (options.includeBoot) {
    writeText(
      join(templateRoot, 'workspaces', 'lawclaw-main', 'BOOT.md'),
      `# BOOT v${version}\n`
    );
  }

  writeText(
    join(templateRoot, 'openclaw.patch.json'),
    JSON.stringify(
      {
        features: {
          [`version_${version}`]: true,
        },
      },
      null,
      2
    )
  );
}

function getWorkspacePath(fixture: FixtureContext, relativePath: string): string {
  return join(fixture.openclawDir, 'workspace-lawclaw-main', relativePath);
}

function getVCurrentMetaPath(fixture: FixtureContext): string {
  return join(fixture.lawclawDir, 'agent-presets', 'v_current', 'meta.json');
}

function getStatePath(fixture: FixtureContext): string {
  return join(fixture.lawclawDir, 'agent-presets', 'state.json');
}

function getBackupRunDirs(fixture: FixtureContext): string[] {
  const backupRootDir = join(fixture.lawclawDir, 'agent-presets', 'backups');
  if (!existsSync(backupRootDir)) {
    return [];
  }
  return readdirSync(backupRootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(backupRootDir, entry.name))
    .sort();
}

function readPresetHash(metaPath: string): string {
  return JSON.parse(readText(metaPath)).presetHash as string;
}

function installTransientRmSyncFailure(failPathFragment: string, errorCode: 'ENOTEMPTY' | 'EPERM') {
  let injected = false;

  __setAgentPresetMigrationTestHooks({
    rmSync: (path, options) => {
      if (!injected && String(path).includes(failPathFragment)) {
        injected = true;
        const error = new Error(`mocked ${errorCode}`) as NodeJS.ErrnoException;
        error.code = errorCode;
        throw error;
      }
      return rmSync(path, options);
    },
    sleep: async () => undefined,
  });

  return {
    wasInjected: () => injected,
  };
}

afterEach(() => {
  stopAgentPresetMigrationCoordinator();
  __resetAgentPresetMigrationTestHooks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('agent preset deterministic migration', () => {
  it('bootstraps managed workspace files and promotes v_update to v_current', async () => {
    const fixture = createFixture();
    writePresetVersion(fixture, 1);

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
    });

    expect(readText(getWorkspacePath(fixture, 'SOUL.md'))).toContain('# SOUL v1');
    expect(readText(getWorkspacePath(fixture, 'AGENTS.md'))).toContain('# AGENTS v1');
    expect(existsSync(getVCurrentMetaPath(fixture))).toBe(true);

    const state = JSON.parse(readText(getStatePath(fixture)));
    expect(state.currentHash).toBe(readPresetHash(getVCurrentMetaPath(fixture)));
    expect(getAgentPresetMigrationStatus().state).toBe('idle');
  });

  it('overwrites files only when local content still equals v_current and creates backup for overwritten files', async () => {
    const fixture = createFixture();
    writePresetVersion(fixture, 1);

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
    });

    writePresetVersion(fixture, 2);

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
    });

    expect(readText(getWorkspacePath(fixture, 'SOUL.md'))).toContain('# SOUL v2');
    expect(readText(getWorkspacePath(fixture, 'AGENTS.md'))).toContain('# AGENTS v2');

    const backupRunDirs = getBackupRunDirs(fixture);
    expect(backupRunDirs.length).toBe(1);
    expect(existsSync(join(backupRunDirs[0], 'backup-meta.json'))).toBe(true);
    expect(readText(join(backupRunDirs[0], 'workspace', 'lawclaw-main', 'SOUL.md'))).toContain(
      '# SOUL v1'
    );
  });

  it('skips locally modified files and reports warning while still promoting v_current', async () => {
    const fixture = createFixture();
    writePresetVersion(fixture, 1);

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
    });

    writeText(getWorkspacePath(fixture, 'AGENTS.md'), '# AGENTS custom\n');
    writePresetVersion(fixture, 2);

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
    });

    expect(readText(getWorkspacePath(fixture, 'SOUL.md'))).toContain('# SOUL v2');
    expect(readText(getWorkspacePath(fixture, 'AGENTS.md'))).toContain('# AGENTS custom');

    const status = getAgentPresetMigrationStatus();
    expect(status.state).toBe('warning');
    expect(status.reason).toBe('PARTIAL_UPDATE');
    expect(status.skippedFiles).toBe(1);
    expect(status.skippedTargets).toEqual(['AGENTS.md']);

    const state = JSON.parse(readText(getStatePath(fixture)));
    expect(state.currentHash).toBe(readPresetHash(getVCurrentMetaPath(fixture)));
  });

  it('creates newly added managed files without creating backup directories', async () => {
    const fixture = createFixture();
    writePresetVersion(fixture, 1);

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
    });

    writePresetVersion(fixture, 2, { includeBoot: true });
    rmSync(getWorkspacePath(fixture, 'BOOT.md'), { force: true });
    writeText(getWorkspacePath(fixture, 'SOUL.md'), readText(
      join(
        fixture.resourcesDir,
        'agent-presets',
        'template',
        'workspaces',
        'lawclaw-main',
        'SOUL.md'
      )
    ));
    writeText(getWorkspacePath(fixture, 'AGENTS.md'), readText(
      join(
        fixture.resourcesDir,
        'agent-presets',
        'template',
        'workspaces',
        'lawclaw-main',
        'AGENTS.md'
      )
    ));

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
    });

    expect(readText(getWorkspacePath(fixture, 'BOOT.md'))).toContain('# BOOT v2');
    expect(getBackupRunDirs(fixture)).toHaveLength(0);
  });

  it('treats upgrade configPatch as an additive merge independent from workspace comparison', async () => {
    const fixture = createFixture();
    writePresetVersion(fixture, 1);

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
    });

    writePresetVersion(fixture, 2);

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
    });

    const config = JSON.parse(readText(join(fixture.openclawDir, 'openclaw.json')));
    expect(config.features).toMatchObject({
      version_1: true,
      version_2: true,
    });
  });

  it('marks migration as failed and keeps previous v_current when declared template files are missing', async () => {
    const fixture = createFixture();
    writePresetVersion(fixture, 1);

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
    });

    const originalHash = readPresetHash(getVCurrentMetaPath(fixture));
    writePresetVersion(fixture, 2, { omitAgentsSourceFile: true });

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
    });

    const status = getAgentPresetMigrationStatus();
    expect(status.state).toBe('failed');
    expect(status.reason).toBe('APPLY_FAILED');
    expect(readPresetHash(getVCurrentMetaPath(fixture))).toBe(originalHash);
  });

  it('retries transient ENOTEMPTY when clearing v_update during upgrade', async () => {
    const fixture = createFixture();
    writePresetVersion(fixture, 1);

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
    });

    writePresetVersion(fixture, 2);

    const harness = installTransientRmSyncFailure(join('agent-presets', 'v_update'), 'ENOTEMPTY');

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
    });

    expect(harness.wasInjected()).toBe(true);
    expect(readText(getWorkspacePath(fixture, 'SOUL.md'))).toContain('# SOUL v2');
    expect(getAgentPresetMigrationStatus().state).not.toBe('failed');
  });

  it('retries transient EPERM when promoting v_update into v_current', async () => {
    const fixture = createFixture();
    writePresetVersion(fixture, 1);

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
    });

    writePresetVersion(fixture, 2);

    const harness = installTransientRmSyncFailure(join('agent-presets', 'v_current'), 'EPERM');

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
    });

    expect(harness.wasInjected()).toBe(true);
    expect(readPresetHash(getVCurrentMetaPath(fixture))).toBe(
      JSON.parse(readText(join(fixture.lawclawDir, 'agent-presets', 'v_update', 'meta.json'))).presetHash
    );
    expect(getAgentPresetMigrationStatus().state).not.toBe('failed');
  });
});
