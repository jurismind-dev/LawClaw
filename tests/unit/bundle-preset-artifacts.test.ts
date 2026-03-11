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

function createJurishubSearchResponse({
  slug,
  highlighted,
  official,
}: {
  slug: string;
  highlighted: boolean;
  official: boolean;
}) {
  return {
    status: 'success',
    value: [
      {
        skill: {
          slug,
          badges: {
            highlighted: highlighted ? { at: Date.now(), byUserId: 'users:1' } : undefined,
            official: official ? { at: Date.now(), byUserId: 'users:1' } : undefined,
          },
        },
      },
    ],
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

describe('bundle-preset-artifacts official+highlighted validation', () => {
  it('allows market preset skill when JurisHub skill is highlighted and official', async () => {
    const context = createFixture();
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify(
          createJurishubSearchResponse({
            slug: 'contract-review-jurismind',
            highlighted: true,
            official: true,
          })
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const errors = await validatePresetManifest(
      {
        schemaVersion: 1,
        presetVersion: '2026.03.11.1',
        items: [
          {
            kind: 'skill',
            id: 'contract-review-jurismind',
            targetVersion: '1.0.0',
            installMode: 'market',
            market: 'jurismindhub',
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

  it('fails when market preset skill is highlighted but not official', async () => {
    const context = createFixture();
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify(
          createJurishubSearchResponse({
            slug: 'contract-review-jurismind',
            highlighted: true,
            official: false,
          })
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const errors = await validatePresetManifest(
      {
        schemaVersion: 1,
        presetVersion: '2026.03.11.1',
        items: [
          {
            kind: 'skill',
            id: 'contract-review-jurismind',
            targetVersion: '1.0.0',
            installMode: 'market',
            market: 'jurismindhub',
          },
        ],
      },
      {
        presetRoot: context.presetRoot,
        fetchImpl,
      }
    );

    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('official+highlighted validation failed');
    expect(errors[0]).toContain('highlighted=True'.toLowerCase());
  });

  it('fails when local artifact skill is missing official+highlighted in JurisHub', async () => {
    const context = createFixture();
    const artifact = createSkillArtifact(context, 'skills/non-official-skill', 'non-official-skill', '1.0.0');
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify(
          createJurishubSearchResponse({
            slug: 'non-official-skill',
            highlighted: true,
            official: false,
          })
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const errors = await validatePresetManifest(
      {
        schemaVersion: 1,
        presetVersion: '2026.03.11.1',
        items: [
          {
            kind: 'skill',
            id: 'non-official-skill',
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
    expect(errors[0]).toContain('official+highlighted validation failed');
  });

  it('fails closed when JurisHub request errors out', async () => {
    const context = createFixture();
    const fetchImpl = vi.fn(async () => {
      throw new Error('network offline');
    });

    const errors = await validatePresetManifest(
      {
        schemaVersion: 1,
        presetVersion: '2026.03.11.1',
        items: [
          {
            kind: 'skill',
            id: 'network-fail-skill',
            targetVersion: '1.0.0',
            installMode: 'market',
            market: 'jurismindhub',
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

  it('skips remote skill validation in offline validation mode', async () => {
    const context = createFixture();
    const fetchImpl = vi.fn(async () => {
      throw new Error('network offline');
    });

    const errors = await validatePresetManifest(
      {
        schemaVersion: 1,
        presetVersion: '2026.03.11.1',
        items: [
          {
            kind: 'skill',
            id: 'offline-skill',
            targetVersion: '1.0.0',
            installMode: 'market',
            market: 'jurismindhub',
          },
        ],
      },
      {
        presetRoot: context.presetRoot,
        fetchImpl,
        skipRemoteSkillValidation: true,
      }
    );

    expect(errors).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('allows market selection mode without per-skill slug validation', async () => {
    const context = createFixture();
    const fetchImpl = vi.fn(async () => {
      throw new Error('should not be called');
    });

    const errors = await validatePresetManifest(
      {
        schemaVersion: 1,
        presetVersion: '2026.03.11.1',
        items: [
          {
            kind: 'skill',
            id: 'jurismindhub-official-highlighted',
            targetVersion: 'latest',
            installMode: 'market',
            market: 'jurismindhub',
            selection: 'official-highlighted',
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

  it('does not call JurisHub check for plugin items', async () => {
    const context = createFixture();
    const artifact = createSkillArtifact(context, 'plugins/qqbot', 'qqbot', '1.0.0');
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ status: 'success', value: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const errors = await validatePresetManifest(
      {
        schemaVersion: 1,
        presetVersion: '2026.03.11.1',
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
