import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeArtifactSha256,
  validatePresetManifest,
} from '../../scripts/bundle-preset-artifacts.mjs';

interface FixtureContext {
  rootDir: string;
  presetRoot: string;
}

const createdRoots: string[] = [];

function createFixture(): FixtureContext {
  const rootDir = mkdtempSync(join(tmpdir(), 'lawclaw-bundle-preset-'));
  const presetRoot = join(rootDir, 'preset-installs');
  mkdirSync(presetRoot, { recursive: true });
  createdRoots.push(rootDir);
  return { rootDir, presetRoot };
}

function createSkillArtifact(
  context: FixtureContext,
  relativePath: string,
  pkgName: string,
  version: string
): { artifactPath: string; sha256: string } {
  const targetDir = join(context.presetRoot, relativePath);
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(join(targetDir, 'package.json'), JSON.stringify({ name: pkgName, version }, null, 2), 'utf-8');
  writeFileSync(join(targetDir, 'SKILL.md'), `# ${pkgName}`, 'utf-8');
  return {
    artifactPath: relativePath.replaceAll('\\', '/'),
    sha256: computeArtifactSha256(targetDir),
  };
}

afterEach(() => {
  while (createdRoots.length > 0) {
    const root = createdRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('bundle-preset-artifacts highlighted validation', () => {
  it('allows preset skill when JurisHub highlighted search returns exact slug match', async () => {
    const context = createFixture();
    const artifact = createSkillArtifact(context, 'skills/contract-review-jurismind', 'contract-review-jurismind', '1.0.0');
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          results: [{ slug: 'contract-review-jurismind', score: 0.9 }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const errors = await validatePresetManifest(
      {
        schemaVersion: 1,
        presetVersion: '2026.03.06.1',
        items: [
          {
            kind: 'skill',
            id: 'contract-review-jurismind',
            targetVersion: '1.0.0',
            artifactPath: artifact.artifactPath,
            sha256: artifact.sha256,
            installMode: 'dir',
          },
        ],
      },
      {
        presetRoot: context.presetRoot,
        fetchImpl,
      }
    );

    expect(errors).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fails when skill is not highlighted in JurisHub search result', async () => {
    const context = createFixture();
    const artifact = createSkillArtifact(context, 'skills/non-highlighted-skill', 'non-highlighted-skill', '1.0.0');
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const errors = await validatePresetManifest(
      {
        schemaVersion: 1,
        presetVersion: '2026.03.06.1',
        items: [
          {
            kind: 'skill',
            id: 'non-highlighted-skill',
            targetVersion: '1.0.0',
            artifactPath: artifact.artifactPath,
            sha256: artifact.sha256,
            installMode: 'dir',
          },
        ],
      },
      {
        presetRoot: context.presetRoot,
        fetchImpl,
      }
    );

    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('JurisHub highlighted validation failed');
    expect(errors[0]).toContain('only JurisHub highlighted skills are allowed');
  });

  it('fails closed when JurisHub highlighted request errors out', async () => {
    const context = createFixture();
    const artifact = createSkillArtifact(context, 'skills/network-fail-skill', 'network-fail-skill', '1.0.0');
    const fetchImpl = vi.fn(async () => {
      throw new Error('network offline');
    });

    const errors = await validatePresetManifest(
      {
        schemaVersion: 1,
        presetVersion: '2026.03.06.1',
        items: [
          {
            kind: 'skill',
            id: 'network-fail-skill',
            targetVersion: '1.0.0',
            artifactPath: artifact.artifactPath,
            sha256: artifact.sha256,
            installMode: 'dir',
          },
        ],
      },
      {
        presetRoot: context.presetRoot,
        fetchImpl,
      }
    );

    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('request failed');
    expect(errors[0]).toContain('network offline');
  });

  it('does not call JurisHub highlighted check for plugin items', async () => {
    const context = createFixture();
    const artifact = createSkillArtifact(context, 'plugins/qqbot', 'qqbot', '1.0.0');
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const errors = await validatePresetManifest(
      {
        schemaVersion: 1,
        presetVersion: '2026.03.06.1',
        items: [
          {
            kind: 'plugin',
            id: 'qqbot',
            targetVersion: '1.0.0',
            artifactPath: artifact.artifactPath,
            sha256: artifact.sha256,
            installMode: 'dir',
          },
        ],
      },
      {
        presetRoot: context.presetRoot,
        fetchImpl,
      }
    );

    expect(errors).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
