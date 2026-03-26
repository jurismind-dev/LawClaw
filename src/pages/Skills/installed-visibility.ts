import type { Skill } from '@/types/skill';

export function isVisibleInstalledSkill(skill: Skill): boolean {
  return !skill.isBundled && !skill.isCore;
}
