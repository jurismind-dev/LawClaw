import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('dashboard skills source guard', () => {
  it('filters bundled and core skills out of dashboard skill stats and badges', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/Dashboard/index.tsx'), 'utf8');

    expect(source).toContain("import { isVisibleInstalledSkill } from '@/pages/Skills/installed-visibility'");
    expect(source).toContain('const visibleSkills = Array.isArray(skills) ? skills.filter(isVisibleInstalledSkill) : [];');
    expect(source).toContain("t('enabledOf', { enabled: enabledSkills, total: visibleSkills.length })");
    expect(source).toContain('{visibleSkills');
  });
});
