import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface WorkspaceFile {
  agentId: string;
  source: string;
  target: string;
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
  it('declares lawclaw-main managed files without upgrade skill or capability conflict strategy', () => {
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
    ]);

    const rawManifest = readFileSync(
      join(process.cwd(), 'resources', 'agent-presets', 'manifest.json'),
      'utf-8'
    );
    expect(rawManifest).not.toContain('append_capabilities');
    expect(rawManifest).not.toContain('skills/lawclaw-upgrade/SKILL.md');
  });

  it('declared template source files all exist and SOUL template no longer contains capability markers', () => {
    const manifest = readManifest();
    const templateRoot = join(process.cwd(), 'resources', 'agent-presets', manifest.templateRoot);

    for (const file of manifest.workspaceFiles) {
      expect(existsSync(join(templateRoot, file.source))).toBe(true);
    }

    if (manifest.configPatch) {
      expect(existsSync(join(templateRoot, manifest.configPatch))).toBe(true);
    }

    const soulTemplate = readFileSync(
      join(templateRoot, 'workspaces', 'lawclaw-main', 'SOUL.md'),
      'utf-8'
    );
    expect(soulTemplate).not.toContain('LAWCLAW_CAPABILITY_START');
    expect(soulTemplate).not.toContain('LAWCLAW_CAPABILITY_END');
  });
});
