import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { loadManifest, validatePresetManifest } from '../../scripts/bundle-preset-artifacts.mjs';

describe('preset install manifest', () => {
  it('matches repository artifact hashes in offline validation mode', async () => {
    const presetRoot = join(process.cwd(), 'resources', 'preset-installs');
    const manifest = loadManifest(join(presetRoot, 'manifest.json'));

    const errors = await validatePresetManifest(manifest, {
      presetRoot,
      skipRemoteSkillValidation: true,
    });

    expect(errors).toEqual([]);
  });
});
