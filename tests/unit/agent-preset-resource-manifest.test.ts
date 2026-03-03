import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface WorkspaceFile {
  agentId: string;
  source: string;
  target: string;
  conflictStrategy?: 'preserve' | 'append_capabilities';
}

interface PresetManifest {
  schemaVersion: number;
  templateRoot: string;
  workspaceFiles: WorkspaceFile[];
  configPatch?: string;
}

function readManifest(): PresetManifest {
  const manifestPath = join(process.cwd(), 'resources', 'agent-presets', 'manifest.json');
  return JSON.parse(readFileSync(manifestPath, 'utf-8')) as PresetManifest;
}

describe('agent preset resource manifest', () => {
  it('lawclaw-main 对齐完整模板下发清单并保留 SOUL 能力块追加策略', () => {
    const manifest = readManifest();
    const lawclawFiles = manifest.workspaceFiles.filter((item) => item.agentId === 'lawclaw-main');

    expect(lawclawFiles.map((item) => item.target).sort()).toEqual([
      'AGENTS.md',
      'BOOT.md',
      'BOOTSTRAP.md',
      'HEARTBEAT.md',
      'IDENTITY.md',
      'SOUL.md',
      'TOOLS.md',
      'USER.md',
      'skills/lawclaw-upgrade/SKILL.md',
    ]);

    const soul = lawclawFiles.find((item) => item.target === 'SOUL.md');
    expect(soul?.conflictStrategy).toBe('append_capabilities');
  });

  it('manifest 声明的模板源文件均存在', () => {
    const manifest = readManifest();
    const templateRoot = join(process.cwd(), 'resources', 'agent-presets', manifest.templateRoot);

    for (const file of manifest.workspaceFiles) {
      expect(existsSync(join(templateRoot, file.source))).toBe(true);
    }

    if (manifest.configPatch) {
      expect(existsSync(join(templateRoot, manifest.configPatch))).toBe(true);
    }
  });
});
