import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClawHubService } from '@electron/gateway/clawhub';

const mockedApp = vi.hoisted(() => ({
  isPackaged: false,
  getAppPath: vi.fn(() => process.cwd()),
  getPath: vi.fn(() => '/tmp'),
}));

const testRoot = vi.hoisted(() => ({
  dir: '',
}));

const managedPythonMocks = vi.hoisted(() => ({
  installManagedPythonRequirements: vi.fn(async () => undefined),
}));

vi.mock('electron', () => ({
  app: mockedApp,
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(),
  },
}));

vi.mock('@electron/utils/paths', () => ({
  getOpenClawConfigDir: vi.fn(() => testRoot.dir),
  ensureDir: vi.fn((dir: string) => mkdirSync(dir, { recursive: true })),
  getClawHubCliBinPath: vi.fn(() => '/tmp/clawhub'),
  getClawHubCliEntryPath: vi.fn(() => '/tmp/clawhub.js'),
  quoteForCmd: vi.fn((value: string) => value),
}));

vi.mock('@electron/utils/uv-setup', () => ({
  installManagedPythonRequirements: managedPythonMocks.installManagedPythonRequirements,
}));

describe('ClawHubService installed skill discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testRoot.dir = mkdtempSync(join(tmpdir(), 'lawclaw-clawhub-'));
  });

  afterEach(() => {
    if (testRoot.dir) {
      rmSync(testRoot.dir, { recursive: true, force: true });
      testRoot.dir = '';
    }
  });

  it('merges local skill directories that are missing from clawhub list output', async () => {
    const skillsDir = join(testRoot.dir, 'skills');
    mkdirSync(join(skillsDir, 'find-skills', '.clawhub'), { recursive: true });
    writeFileSync(
      join(skillsDir, 'find-skills', '.clawhub', 'origin.json'),
      JSON.stringify({ registry: 'https://lawhub.jurismind.com', slug: 'find-skills' }),
      'utf8'
    );

    mkdirSync(join(skillsDir, 'excel-xlsx-1.0.2'), { recursive: true });
    writeFileSync(
      join(skillsDir, 'excel-xlsx-1.0.2', '_meta.json'),
      JSON.stringify({ slug: 'excel-xlsx', version: '1.0.2' }),
      'utf8'
    );
    writeFileSync(join(skillsDir, 'excel-xlsx-1.0.2', 'SKILL.md'), '# excel-xlsx', 'utf8');

    const service = new ClawHubService({
      market: 'clawhub',
      siteUrl: 'https://clawhub.ai',
      registryUrl: 'https://clawhub.ai',
    });

    vi.spyOn(service as never, 'runCommand').mockResolvedValue('find-skills  0.1.0');

    await expect(service.listInstalled()).resolves.toEqual([
      { slug: 'find-skills', version: '0.1.0', installSource: 'jurismindhub' },
      { slug: 'excel-xlsx', version: '1.0.2', installSource: 'unknown' },
    ]);
  });

  it('uninstalls version-suffixed local skill directories by metadata slug', async () => {
    const versionedSkillDir = join(testRoot.dir, 'skills', 'excel-xlsx-1.0.2');
    mkdirSync(versionedSkillDir, { recursive: true });
    writeFileSync(
      join(versionedSkillDir, '_meta.json'),
      JSON.stringify({ slug: 'excel-xlsx', version: '1.0.2' }),
      'utf8'
    );
    writeFileSync(join(versionedSkillDir, 'SKILL.md'), '# excel-xlsx', 'utf8');

    const service = new ClawHubService({
      market: 'clawhub',
      siteUrl: 'https://clawhub.ai',
      registryUrl: 'https://clawhub.ai',
    });

    await service.uninstall({ slug: 'excel-xlsx' });

    expect(() => rmSync(versionedSkillDir, { recursive: true })).toThrow();
  });

  it('warms managed Python requirements after installing a skill with requirements.txt', async () => {
    const skillDir = join(testRoot.dir, 'skills', '合同审查专家');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, '_meta.json'),
      JSON.stringify({ slug: '合同审查专家', version: '2.0.0' }),
      'utf8'
    );
    writeFileSync(join(skillDir, 'SKILL.md'), '# 合同审查专家', 'utf8');
    writeFileSync(join(skillDir, 'requirements.txt'), "pywin32; sys_platform == 'win32'\n", 'utf8');

    const service = new ClawHubService({
      market: 'jurismindhub',
      siteUrl: 'https://lawhub.jurismind.com',
      registryUrl: 'https://lawhub.jurismind.com',
    });

    vi.spyOn(service as never, 'runCommandWithRetry').mockResolvedValue('');

    await service.install({ slug: '合同审查专家', version: '2.0.0' });

    expect(managedPythonMocks.installManagedPythonRequirements).toHaveBeenCalledWith(
      join(skillDir, 'requirements.txt')
    );
  });
});
