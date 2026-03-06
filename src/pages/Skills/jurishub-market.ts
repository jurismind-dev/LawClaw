import type { MarketplaceSkill } from '@/types/skill';

export type JurisHubSortMode = 'createdAt' | 'stars' | 'downloads';

export const JURISHUB_PAGE_SIZE = 12;

export function sortJurisHubSkills(
  skills: MarketplaceSkill[],
  sortMode: JurisHubSortMode
): MarketplaceSkill[] {
  const normalized = [...skills];

  normalized.sort((a, b) => {
    if (sortMode === 'stars') {
      const starDiff = (b.stars ?? 0) - (a.stars ?? 0);
      if (starDiff !== 0) return starDiff;
    } else if (sortMode === 'downloads') {
      const downloadDiff = (b.downloads ?? 0) - (a.downloads ?? 0);
      if (downloadDiff !== 0) return downloadDiff;
    } else {
      const createdDiff = (b.createdAt ?? 0) - (a.createdAt ?? 0);
      if (createdDiff !== 0) return createdDiff;
    }

    const updatedDiff = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    if (updatedDiff !== 0) return updatedDiff;

    return a.slug.localeCompare(b.slug);
  });

  return normalized;
}

export function paginateJurisHubSkills(skills: MarketplaceSkill[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(skills.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const items = skills.slice(start, start + pageSize);

  return {
    items,
    totalPages,
    page: safePage,
  };
}
