/**
 * Skills State Store
 * Manages skill/plugin state
 */
import { create } from 'zustand';
import type { Skill, MarketplaceSkill } from '../types/skill';

export type SkillsMarket = 'clawhub' | 'jurismindhub';

const MARKETS: SkillsMarket[] = ['clawhub', 'jurismindhub'];

type GatewaySkillStatus = {
  skillKey: string;
  slug?: string;
  name?: string;
  description?: string;
  disabled?: boolean;
  emoji?: string;
  version?: string;
  author?: string;
  config?: Record<string, unknown>;
  bundled?: boolean;
  always?: boolean;
};

type GatewaySkillsStatusResult = {
  skills?: GatewaySkillStatus[];
};

type GatewayRpcResponse<T> = {
  success: boolean;
  result?: T;
  error?: string;
};

type InstalledSkillResult = {
  slug: string;
  version?: string;
  installSource?: Skill['installSource'];
};

type SearchResponse = {
  success: boolean;
  results?: MarketplaceSkill[];
  error?: string;
};

type MutateResponse = {
  success: boolean;
  error?: string;
};

function createEmptySearchResults(): Record<SkillsMarket, MarketplaceSkill[]> {
  return {
    clawhub: [],
    jurismindhub: [],
  };
}

function createEmptySearchingState(): Record<SkillsMarket, boolean> {
  return {
    clawhub: false,
    jurismindhub: false,
  };
}

function createEmptySearchErrorState(): Record<SkillsMarket, string | null> {
  return {
    clawhub: null,
    jurismindhub: null,
  };
}

function resolveInstallSource(
  source: Skill['installSource'] | undefined,
  fallback: Skill['installSource'] | undefined = 'unknown'
): Skill['installSource'] {
  if (source === 'clawhub' || source === 'jurismindhub' || source === 'unknown') {
    return source;
  }

  return fallback;
}

interface SkillsState {
  skills: Skill[];
  searchResults: MarketplaceSkill[];
  searchResultsByMarket: Record<SkillsMarket, MarketplaceSkill[]>;
  loading: boolean;
  searching: boolean;
  searchingByMarket: Record<SkillsMarket, boolean>;
  searchError: string | null;
  searchErrorByMarket: Record<SkillsMarket, string | null>;
  installing: Record<string, boolean>; // slug -> boolean
  error: string | null;

  // Actions
  fetchSkills: () => Promise<void>;
  searchSkills: (market: SkillsMarket, query: string) => Promise<void>;
  installSkill: (market: SkillsMarket, slug: string, version?: string) => Promise<void>;
  uninstallSkill: (market: SkillsMarket, slug: string) => Promise<void>;
  enableSkill: (skillId: string) => Promise<void>;
  disableSkill: (skillId: string) => Promise<void>;
  setSkills: (skills: Skill[]) => void;
  updateSkill: (skillId: string, updates: Partial<Skill>) => void;
  getSearchResults: (market: SkillsMarket) => MarketplaceSkill[];
  getSearching: (market: SkillsMarket) => boolean;
  getSearchError: (market: SkillsMarket) => string | null;
}

export const useSkillsStore = create<SkillsState>((set, get) => ({
  skills: [],
  searchResults: [],
  searchResultsByMarket: createEmptySearchResults(),
  loading: false,
  searching: false,
  searchingByMarket: createEmptySearchingState(),
  searchError: null,
  searchErrorByMarket: createEmptySearchErrorState(),
  installing: {},
  error: null,

  fetchSkills: async () => {
    // Only show loading state if we have no skills yet (initial load)
    if (get().skills.length === 0) {
      set({ loading: true, error: null });
    }

    try {
      // 1. Fetch from Gateway (running skills)
      const gatewayResult = (await window.electron.ipcRenderer.invoke(
        'gateway:rpc',
        'skills.status'
      )) as GatewayRpcResponse<GatewaySkillsStatusResult>;

      // 2. Fetch from marketplace install records on disk
      const installedResult = (await window.electron.ipcRenderer.invoke(
        'clawhub:list'
      )) as { success: boolean; results?: InstalledSkillResult[]; error?: string };

      // 3. Fetch configurations directly from Electron (Gateway does not return all configs)
      const configResult = (await window.electron.ipcRenderer.invoke(
        'skill:getAllConfigs'
      )) as Record<string, { apiKey?: string; env?: Record<string, string> }>;

      let combinedSkills: Skill[] = [];
      const currentSkills = get().skills;

      if (gatewayResult.success && gatewayResult.result?.skills) {
        combinedSkills = gatewayResult.result.skills.map((skillStatus: GatewaySkillStatus) => {
          const directConfig = configResult[skillStatus.skillKey] || {};
          const existing = currentSkills.find(
            (skill) => skill.id === skillStatus.skillKey || skill.slug === skillStatus.slug
          );

          return {
            id: skillStatus.skillKey,
            slug: skillStatus.slug || skillStatus.skillKey,
            name: skillStatus.name || skillStatus.skillKey,
            description: skillStatus.description || '',
            enabled: !skillStatus.disabled,
            icon: skillStatus.emoji || '\uD83E\uDDE9',
            version: skillStatus.version || '1.0.0',
            author: skillStatus.author,
            config: {
              ...(skillStatus.config || {}),
              ...directConfig,
            },
            isCore: skillStatus.bundled && skillStatus.always,
            isBundled: skillStatus.bundled,
            installSource: skillStatus.bundled
              ? undefined
              : resolveInstallSource(existing?.installSource),
          } satisfies Skill;
        });
      } else if (currentSkills.length > 0) {
        // If gateway is unavailable, keep current skills in UI.
        combinedSkills = [...currentSkills];
      }

      // Merge in all locally installed skills (from marketplace manager)
      if (installedResult.success && installedResult.results) {
        installedResult.results.forEach((installedSkill: InstalledSkillResult) => {
          const existing = combinedSkills.find((skill) => skill.id === installedSkill.slug);
          if (existing) {
            existing.version = installedSkill.version || existing.version;
            existing.installSource = resolveInstallSource(installedSkill.installSource, existing.installSource);
            return;
          }

          const directConfig = configResult[installedSkill.slug] || {};
          combinedSkills.push({
            id: installedSkill.slug,
            slug: installedSkill.slug,
            name: installedSkill.slug,
            description: 'Recently installed, initializing...',
            enabled: false,
            icon: '\uD83E\uDDE9',
            version: installedSkill.version || 'unknown',
            author: undefined,
            config: directConfig,
            isCore: false,
            isBundled: false,
            installSource: resolveInstallSource(installedSkill.installSource),
          });
        });
      }

      set({ skills: combinedSkills, loading: false, error: null });
    } catch (error) {
      console.error('Failed to fetch skills:', error);
      set({ loading: false, error: String(error) });
    }
  },

  searchSkills: async (market: SkillsMarket, query: string) => {
    set((state) => ({
      searching: true,
      searchingByMarket: {
        ...state.searchingByMarket,
        [market]: true,
      },
      searchError: null,
      searchErrorByMarket: {
        ...state.searchErrorByMarket,
        [market]: null,
      },
    }));

    try {
      const result = (await window.electron.ipcRenderer.invoke(`${market}:search`, {
        query,
      })) as SearchResponse;

      if (!result.success) {
        throw new Error(result.error || 'Search failed');
      }

      const marketResults = (result.results || []).map((skill) => ({
        ...skill,
        market,
      }));

      set((state) => ({
        searchResults: marketResults,
        searchResultsByMarket: {
          ...state.searchResultsByMarket,
          [market]: marketResults,
        },
        searchError: null,
        searchErrorByMarket: {
          ...state.searchErrorByMarket,
          [market]: null,
        },
      }));
    } catch (error) {
      const message = String(error);
      set((state) => ({
        searchError: message,
        searchErrorByMarket: {
          ...state.searchErrorByMarket,
          [market]: message,
        },
      }));
    } finally {
      set((state) => {
        const searchingByMarket = {
          ...state.searchingByMarket,
          [market]: false,
        };

        return {
          searching: MARKETS.some((item) => searchingByMarket[item]),
          searchingByMarket,
        };
      });
    }
  },

  installSkill: async (market: SkillsMarket, slug: string, version?: string) => {
    set((state) => ({ installing: { ...state.installing, [slug]: true } }));

    try {
      const result = (await window.electron.ipcRenderer.invoke(`${market}:install`, {
        slug,
        version,
      })) as MutateResponse;

      if (!result.success) {
        throw new Error(result.error || 'Install failed');
      }

      await get().fetchSkills();
    } catch (error) {
      console.error('Install error:', error);
      throw error;
    } finally {
      set((state) => {
        const nextInstalling = { ...state.installing };
        delete nextInstalling[slug];
        return { installing: nextInstalling };
      });
    }
  },

  uninstallSkill: async (market: SkillsMarket, slug: string) => {
    set((state) => ({ installing: { ...state.installing, [slug]: true } }));

    try {
      const result = (await window.electron.ipcRenderer.invoke(`${market}:uninstall`, {
        slug,
      })) as MutateResponse;

      if (!result.success) {
        throw new Error(result.error || 'Uninstall failed');
      }

      await get().fetchSkills();
    } catch (error) {
      console.error('Uninstall error:', error);
      throw error;
    } finally {
      set((state) => {
        const nextInstalling = { ...state.installing };
        delete nextInstalling[slug];
        return { installing: nextInstalling };
      });
    }
  },

  enableSkill: async (skillId) => {
    const { updateSkill } = get();

    try {
      const result = (await window.electron.ipcRenderer.invoke(
        'gateway:rpc',
        'skills.update',
        { skillKey: skillId, enabled: true }
      )) as GatewayRpcResponse<unknown>;

      if (result.success) {
        updateSkill(skillId, { enabled: true });
      } else {
        throw new Error(result.error || 'Failed to enable skill');
      }
    } catch (error) {
      console.error('Failed to enable skill:', error);
      throw error;
    }
  },

  disableSkill: async (skillId) => {
    const { updateSkill, skills } = get();

    const skill = skills.find((item) => item.id === skillId);
    if (skill?.isCore) {
      throw new Error('Cannot disable core skill');
    }

    try {
      const result = (await window.electron.ipcRenderer.invoke(
        'gateway:rpc',
        'skills.update',
        { skillKey: skillId, enabled: false }
      )) as GatewayRpcResponse<unknown>;

      if (result.success) {
        updateSkill(skillId, { enabled: false });
      } else {
        throw new Error(result.error || 'Failed to disable skill');
      }
    } catch (error) {
      console.error('Failed to disable skill:', error);
      throw error;
    }
  },

  setSkills: (skills) => set({ skills }),

  updateSkill: (skillId, updates) => {
    set((state) => ({
      skills: state.skills.map((skill) =>
        skill.id === skillId ? { ...skill, ...updates } : skill
      ),
    }));
  },

  getSearchResults: (market: SkillsMarket) => get().searchResultsByMarket[market],

  getSearching: (market: SkillsMarket) => get().searchingByMarket[market],

  getSearchError: (market: SkillsMarket) => get().searchErrorByMarket[market],
}));
