import { describe, expect, it } from 'vitest';
import { isVisibleInstalledSkill } from '@/pages/Skills/installed-visibility';
import type { Skill } from '@/types/skill';

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-id',
    name: 'Skill',
    description: 'desc',
    enabled: true,
    ...overrides,
  };
}

describe('skills installed visibility', () => {
  it('hides bundled and core openclaw skills from the installed view', () => {
    expect(isVisibleInstalledSkill(makeSkill({ isBundled: true }))).toBe(false);
    expect(isVisibleInstalledSkill(makeSkill({ isCore: true }))).toBe(false);
    expect(
      isVisibleInstalledSkill(makeSkill({ isBundled: true, isCore: true }))
    ).toBe(false);
  });

  it('keeps all user-managed skills visible in the installed view', () => {
    expect(
      isVisibleInstalledSkill(makeSkill({ installSource: 'jurismindhub' }))
    ).toBe(true);
    expect(
      isVisibleInstalledSkill(makeSkill({ installSource: 'clawhub' }))
    ).toBe(true);
    expect(
      isVisibleInstalledSkill(makeSkill({ installSource: 'unknown' }))
    ).toBe(true);
  });
});
