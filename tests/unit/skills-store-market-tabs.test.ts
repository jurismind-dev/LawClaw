import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSkillsStore } from '@/stores/skills';

const invokeMock = window.electron.ipcRenderer.invoke as unknown as ReturnType<typeof vi.fn>;

describe('skills store market tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSkillsStore.setState({
      skills: [],
      searchResults: [],
      loading: false,
      searching: false,
      searchError: null,
      installing: {},
      error: null,
    });
  });

  it('routes search requests by market channel', async () => {
    invokeMock.mockResolvedValue({ success: true, results: [] });

    await useSkillsStore.getState().searchSkills('clawhub', 'legal');
    expect(invokeMock).toHaveBeenCalledWith('clawhub:search', { query: 'legal' });

    await useSkillsStore.getState().searchSkills('jurismindhub', 'legal');
    expect(invokeMock).toHaveBeenCalledWith('jurismindhub:search', { query: 'legal' });
  });

  it('routes install/uninstall requests by market channel', async () => {
    invokeMock.mockImplementation(async (channel: string) => {
      if (channel === 'gateway:rpc') {
        return { success: true, result: { skills: [] } };
      }
      if (channel === 'skill:getAllConfigs') {
        return {};
      }
      return { success: true, results: [] };
    });

    await useSkillsStore.getState().installSkill('jurismindhub', 'chinese-legal-expert');
    expect(invokeMock).toHaveBeenCalledWith('jurismindhub:install', {
      slug: 'chinese-legal-expert',
      version: undefined,
    });

    await useSkillsStore.getState().uninstallSkill('clawhub', 'chinese-legal-expert');
    expect(invokeMock).toHaveBeenCalledWith('clawhub:uninstall', {
      slug: 'chinese-legal-expert',
    });
  });
});
