import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tempHomes: string[] = [];

async function loadOpenClawAuthWithHome(homeDir: string) {
  vi.resetModules();
  vi.doMock('os', () => ({
    homedir: () => homeDir,
    default: {
      homedir: () => homeDir,
    },
  }));
  return import('@electron/utils/openclaw-auth');
}

afterEach(() => {
  vi.doUnmock('os');
  vi.resetModules();

  while (tempHomes.length > 0) {
    const dir = tempHomes.pop();
    if (!dir) continue;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('openclaw auth - agent model targeting', () => {
  it('setOpenClawAgentModel 仅更新目标 agent，不改 agents.defaults.model', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'lawclaw-openclaw-auth-'));
    tempHomes.push(homeDir);

    const openclawDir = join(homeDir, '.openclaw');
    mkdirSync(openclawDir, { recursive: true });
    const configPath = join(openclawDir, 'openclaw.json');
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          agents: {
            defaults: {
              model: {
                primary: 'openai/gpt-5.2',
              },
            },
            list: [
              { id: 'main', model: { primary: 'openai/gpt-5.2' } },
              { id: 'lawclaw-main', name: 'LawClaw 主智能体' },
              { id: 'other-agent', model: { primary: 'moonshot/kimi-k2.5' } },
            ],
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const mod = await loadOpenClawAuthWithHome(homeDir);
    mod.setOpenClawAgentModel('lawclaw-main', 'jurismind');

    const next = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      agents: {
        defaults: { model: { primary: string } };
        list: Array<{ id: string; model?: { primary?: string } }>;
      };
    };

    const lawclawMain = next.agents.list.find((item) => item.id === 'lawclaw-main');
    const main = next.agents.list.find((item) => item.id === 'main');
    const other = next.agents.list.find((item) => item.id === 'other-agent');

    expect(lawclawMain?.model?.primary).toBe('jurismind/jurismind');
    expect(main?.model?.primary).toBe('openai/gpt-5.2');
    expect(other?.model?.primary).toBe('moonshot/kimi-k2.5');
    expect(next.agents.defaults.model.primary).toBe('openai/gpt-5.2');
  });
});
