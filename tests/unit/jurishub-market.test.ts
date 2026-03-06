import { describe, expect, it } from 'vitest';
import { paginateJurisHubSkills, sortJurisHubSkills } from '@/pages/Skills/jurishub-market';
import type { MarketplaceSkill } from '@/types/skill';

const baseSkills: MarketplaceSkill[] = [
  {
    slug: 'a',
    name: 'A',
    description: '',
    version: '1.0.0',
    createdAt: 100,
    updatedAt: 100,
    stars: 2,
    downloads: 8,
  },
  {
    slug: 'b',
    name: 'B',
    description: '',
    version: '1.0.0',
    createdAt: 300,
    updatedAt: 200,
    stars: 1,
    downloads: 12,
  },
  {
    slug: 'c',
    name: 'C',
    description: '',
    version: '1.0.0',
    createdAt: 200,
    updatedAt: 300,
    stars: 2,
    downloads: 6,
  },
];

describe('jurishub market helpers', () => {
  it('sorts by createdAt desc by default', () => {
    const sorted = sortJurisHubSkills(baseSkills, 'createdAt');
    expect(sorted.map((item) => item.slug)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by stars desc and falls back to updatedAt/slug', () => {
    const sorted = sortJurisHubSkills(baseSkills, 'stars');
    expect(sorted.map((item) => item.slug)).toEqual(['c', 'a', 'b']);
  });

  it('sorts by downloads desc', () => {
    const sorted = sortJurisHubSkills(baseSkills, 'downloads');
    expect(sorted.map((item) => item.slug)).toEqual(['b', 'a', 'c']);
  });

  it('paginates and clamps out-of-range page numbers', () => {
    const page1 = paginateJurisHubSkills(baseSkills, 1, 2);
    expect(page1.page).toBe(1);
    expect(page1.totalPages).toBe(2);
    expect(page1.items.map((item) => item.slug)).toEqual(['a', 'b']);

    const page99 = paginateJurisHubSkills(baseSkills, 99, 2);
    expect(page99.page).toBe(2);
    expect(page99.items.map((item) => item.slug)).toEqual(['c']);
  });
});
