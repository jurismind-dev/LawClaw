import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('skills page source guard', () => {
  it('keeps the installed view focused on user-managed skills and hides bundled filter UI', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/Skills/index.tsx'), 'utf8');

    expect(source).toContain("import { isVisibleInstalledSkill } from '@/pages/Skills/installed-visibility'");
    expect(source).toContain('const visibleSkills = skills.filter(isVisibleInstalledSkill);');
    expect(source).not.toContain("t('filter.builtIn'");
    expect(source).not.toContain("setSelectedSource('built-in')");
  });

  it('renders a dedicated installed state for jurishub marketplace cards', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/Skills/index.tsx'), 'utf8');

    expect(source).toContain("const jurismindhubInstalledCount = visibleSkills.filter(");
    expect(source).toContain("t('tabs.installedWithCount', { count: visibleSkills.length })");
    expect(source).toContain("t('tabs.jurismindhubWithCount', { count: jurismindhubInstalledCount })");
    expect(source).toContain("{t('tabs.installed')}");
    expect(source).toContain('className="min-w-0 flex-1 leading-5"');
    expect(source).toContain('className="h-auto shrink-0 whitespace-nowrap px-1.5 py-0.5 text-[10px] leading-none"');
    expect(source).toContain('variant="destructive"');
  });
});
