import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSkillsStore } from '@/stores/skills';

const invokeMock = window.electron.ipcRenderer.invoke as unknown as ReturnType<typeof vi.fn>;

function countInvokeCalls(channel: string): number {
  return invokeMock.mock.calls.filter(([calledChannel]) => calledChannel === channel).length;
}

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

  it('deduplicates concurrent marketplace search calls for the same market/query', async () => {
    let resolveSearch: ((value: { success: boolean; results: [] }) => void) | null = null;

    invokeMock.mockImplementation((channel: string) => {
      if (channel === 'jurismindhub:search') {
        return new Promise((resolve) => {
          resolveSearch = resolve as (value: { success: boolean; results: [] }) => void;
        });
      }
      return Promise.resolve({ success: true, results: [] });
    });

    const p1 = useSkillsStore.getState().searchSkills('jurismindhub', '');
    const p2 = useSkillsStore.getState().searchSkills('jurismindhub', '');

    expect(countInvokeCalls('jurismindhub:search')).toBe(1);

    resolveSearch?.({ success: true, results: [] });
    await Promise.all([p1, p2]);
  });

  it('deduplicates concurrent fetchSkills calls', async () => {
    let resolveGateway: ((value: { success: boolean; result: { skills: [] } }) => void) | null = null;

    invokeMock.mockImplementation((channel: string) => {
      if (channel === 'gateway:rpc') {
        return new Promise((resolve) => {
          resolveGateway = resolve as (value: { success: boolean; result: { skills: [] } }) => void;
        });
      }
      if (channel === 'clawhub:list') {
        return Promise.resolve({ success: true, results: [] });
      }
      if (channel === 'skill:getAllConfigs') {
        return Promise.resolve({});
      }
      return Promise.resolve({ success: true });
    });

    const p1 = useSkillsStore.getState().fetchSkills();
    const p2 = useSkillsStore.getState().fetchSkills();

    expect(countInvokeCalls('gateway:rpc')).toBe(1);

    resolveGateway?.({ success: true, result: { skills: [] } });
    await Promise.all([p1, p2]);

    expect(countInvokeCalls('clawhub:list')).toBe(1);
    expect(countInvokeCalls('skill:getAllConfigs')).toBe(1);
  });

  it('uses persisted enabled=true when installed skill is missing from gateway status', async () => {
    invokeMock.mockImplementation((channel: string) => {
      if (channel === 'gateway:rpc') {
        return Promise.resolve({ success: true, result: { skills: [] } });
      }
      if (channel === 'clawhub:list') {
        return Promise.resolve({
          success: true,
          results: [{ slug: 'chinese-legal-expert', version: '1.0.0', installSource: 'jurismindhub' }],
        });
      }
      if (channel === 'skill:getAllConfigs') {
        return Promise.resolve({ 'chinese-legal-expert': { enabled: true } });
      }
      return Promise.resolve({ success: true });
    });

    await useSkillsStore.getState().fetchSkills();

    const skill = useSkillsStore.getState().skills.find((item) => item.id === 'chinese-legal-expert');
    expect(skill?.enabled).toBe(true);
  });

  it('uses persisted enabled=false when installed skill is missing from gateway status', async () => {
    invokeMock.mockImplementation((channel: string) => {
      if (channel === 'gateway:rpc') {
        return Promise.resolve({ success: true, result: { skills: [] } });
      }
      if (channel === 'clawhub:list') {
        return Promise.resolve({
          success: true,
          results: [{ slug: 'chinese-legal-expert', version: '1.0.0', installSource: 'jurismindhub' }],
        });
      }
      if (channel === 'skill:getAllConfigs') {
        return Promise.resolve({ 'chinese-legal-expert': { enabled: false } });
      }
      return Promise.resolve({ success: true });
    });

    await useSkillsStore.getState().fetchSkills();

    const skill = useSkillsStore.getState().skills.find((item) => item.id === 'chinese-legal-expert');
    expect(skill?.enabled).toBe(false);
  });

  it('defaults to disabled when persisted enabled is missing', async () => {
    invokeMock.mockImplementation((channel: string) => {
      if (channel === 'gateway:rpc') {
        return Promise.resolve({ success: true, result: { skills: [] } });
      }
      if (channel === 'clawhub:list') {
        return Promise.resolve({
          success: true,
          results: [{ slug: 'chinese-legal-expert', version: '1.0.0', installSource: 'jurismindhub' }],
        });
      }
      if (channel === 'skill:getAllConfigs') {
        return Promise.resolve({ 'chinese-legal-expert': {} });
      }
      return Promise.resolve({ success: true });
    });

    await useSkillsStore.getState().fetchSkills();

    const skill = useSkillsStore.getState().skills.find((item) => item.id === 'chinese-legal-expert');
    expect(skill?.enabled).toBe(false);
  });
});
