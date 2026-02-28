import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import {
  getAgentPresetMigrationStatus,
  onAgentPresetMigrationStatus,
  retryAgentPresetMigrationNow,
  runAgentPresetStartupMigration,
  stopAgentPresetMigrationCoordinator,
} from '@electron/utils/agent-preset-migration';
import { readAgentPresetQueue } from '@electron/utils/agent-preset-queue';

interface FixtureContext {
  rootDir: string;
  resourcesDir: string;
  openclawDir: string;
  lawclawDir: string;
  templateLawclawSoul: string;
}

const tempDirs: string[] = [];

function writeText(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
}

function readText(filePath: string): string {
  return readFileSync(filePath, 'utf-8');
}

function createFixture(): FixtureContext {
  const rootDir = mkdtempSync(join(tmpdir(), 'lawclaw-agent-preset-'));
  tempDirs.push(rootDir);

  const resourcesDir = join(rootDir, 'resources');
  const presetRoot = join(resourcesDir, 'agent-presets');
  const templateRoot = join(presetRoot, 'template');
  const openclawDir = join(rootDir, '.openclaw');
  const lawclawDir = join(rootDir, '.LawClaw');

  const templateLawclawSoul = [
    '# v2 lawclaw-main',
    '',
    '<!-- LAWCLAW_CAPABILITY_START:intake -->',
    'v2 intake',
    '<!-- LAWCLAW_CAPABILITY_END:intake -->',
    '',
    '<!-- LAWCLAW_CAPABILITY_START:risk -->',
    'v2 risk',
    '<!-- LAWCLAW_CAPABILITY_END:risk -->',
  ].join('\n');

  const manifest = {
    schemaVersion: 2,
    templateRoot: 'template',
    workspaceFiles: [
      {
        agentId: 'lawclaw-main',
        source: 'workspaces/lawclaw-main/SOUL.md',
        target: 'SOUL.md',
        conflictStrategy: 'append_capabilities',
      },
      {
        agentId: 'lawclaw-main',
        source: 'workspaces/lawclaw-main/AGENTS.md',
        target: 'AGENTS.md',
      },
      {
        agentId: 'lawclaw-main',
        source: 'workspaces/lawclaw-main/skills/lawclaw-upgrade/SKILL.md',
        target: 'skills/lawclaw-upgrade/SKILL.md',
      },
    ],
    configPatch: 'openclaw.patch.json',
  };

  writeText(join(presetRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));
  writeText(join(templateRoot, 'workspaces', 'lawclaw-main', 'SOUL.md'), templateLawclawSoul);
  writeText(join(templateRoot, 'workspaces', 'lawclaw-main', 'AGENTS.md'), '# agents');
  writeText(
    join(templateRoot, 'workspaces', 'lawclaw-main', 'skills', 'lawclaw-upgrade', 'SKILL.md'),
    '# skill'
  );
  writeText(
    join(templateRoot, 'openclaw.patch.json'),
    JSON.stringify(
      {
        agents: {
          list: [
            {
              id: 'lawclaw-main',
              name: 'LawClaw 主智能体',
              model: {
                primary: 'jurismind/kimi-k2.5',
              },
            },
          ],
        },
      },
      null,
      2
    )
  );

  return {
    rootDir,
    resourcesDir,
    openclawDir,
    lawclawDir,
    templateLawclawSoul,
  };
}

afterEach(() => {
  stopAgentPresetMigrationCoordinator();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('agent preset smart migration coordinator (lawclaw-main)', () => {
  it('首次启动成功后会生成 v_update、晋升 v_current，并写入 lawclaw-main workspace', async () => {
    const fixture = createFixture();

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner: async () => ({
        schemaVersion: 1,
        decision: 'apply',
        files: [],
      }),
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    const queue = readAgentPresetQueue(join(fixture.lawclawDir, 'agent-presets', 'queue.json'));
    expect(queue.tasks.length).toBe(0);

    expect(readText(join(fixture.openclawDir, 'workspace-lawclaw-main', 'SOUL.md'))).toContain(
      'v2 lawclaw-main'
    );
    expect(existsSync(join(fixture.openclawDir, 'workspace', 'SOUL.md'))).toBe(false);

    const vCurrentMetaPath = join(fixture.lawclawDir, 'agent-presets', 'v_current', 'meta.json');
    const vUpdateMetaPath = join(fixture.lawclawDir, 'agent-presets', 'v_update', 'meta.json');
    expect(existsSync(vCurrentMetaPath)).toBe(true);
    expect(existsSync(vUpdateMetaPath)).toBe(true);

    const vCurrentHash = JSON.parse(readText(vCurrentMetaPath)).presetHash;
    const vUpdateHash = JSON.parse(readText(vUpdateMetaPath)).presetHash;
    expect(vCurrentHash).toBe(vUpdateHash);

    const state = JSON.parse(readText(join(fixture.lawclawDir, 'agent-presets', 'state.json')));
    expect(state.currentHash).toBe(vCurrentHash);
  });

  it('旧版 main 工作区自定义不会被覆盖', async () => {
    const fixture = createFixture();
    const mainSoulPath = join(fixture.openclawDir, 'workspace', 'SOUL.md');
    writeText(mainSoulPath, '# user custom main');

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner: async () => ({
        schemaVersion: 1,
        decision: 'apply',
        files: [],
      }),
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    expect(readText(mainSoulPath)).toContain('# user custom main');
    expect(readText(join(fixture.openclawDir, 'workspace-lawclaw-main', 'SOUL.md'))).toContain(
      'v2 lawclaw-main'
    );
  });

  it('调用 planner 前会预写入 lawclaw-upgrade skill，避免会话读文件报 ENOENT', async () => {
    const fixture = createFixture();
    const skillPath = join(
      fixture.openclawDir,
      'workspace-lawclaw-main',
      'skills',
      'lawclaw-upgrade',
      'SKILL.md'
    );
    let skillExistsWhenPlannerRuns = false;

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner: vi.fn(),
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });
    writeText(
      join(fixture.resourcesDir, 'agent-presets', 'template', 'workspaces', 'lawclaw-main', 'SOUL.md'),
      `${fixture.templateLawclawSoul}\n\n<!-- LAWCLAW_CAPABILITY_START:skill-bootstrap-test -->\nnew\n<!-- LAWCLAW_CAPABILITY_END:skill-bootstrap-test -->`
    );
    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner: async () => {
        skillExistsWhenPlannerRuns = existsSync(skillPath);
        return {
          schemaVersion: 1,
          decision: 'apply',
          files: [],
        };
      },
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    expect(skillExistsWhenPlannerRuns).toBe(true);
    expect(readText(skillPath)).toContain('# skill');
  });

  it('模板 hash 不变时不会重复入队', async () => {
    const fixture = createFixture();
    const planner = vi.fn().mockResolvedValue({
      schemaVersion: 1,
      decision: 'apply',
      files: [],
    });

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner,
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner,
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    expect(planner).toHaveBeenCalledTimes(0);
    const queue = readAgentPresetQueue(join(fixture.lawclawDir, 'agent-presets', 'queue.json'));
    expect(queue.tasks.length).toBe(0);
  });

  it('模板 hash 不变时仍会回正 lawclaw-main workspace', async () => {
    const fixture = createFixture();
    const planner = vi.fn().mockResolvedValue({
      schemaVersion: 1,
      decision: 'apply',
      files: [],
    });

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner,
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    const configPath = join(fixture.openclawDir, 'openclaw.json');
    const config = JSON.parse(readText(configPath)) as {
      agents: { list: Array<{ id: string; workspace?: string; workspaceDir?: string }> };
    };
    const lawclawMain = config.agents.list.find((item) => item.id === 'lawclaw-main');
    expect(lawclawMain).toBeDefined();
    lawclawMain!.workspace = 'C:\\Users\\umx_a\\.openclaw\\workspace';
    lawclawMain!.workspaceDir = 'C:\\Users\\umx_a\\Downloads\\README\\README';
    writeText(configPath, JSON.stringify(config, null, 2));

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner,
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    expect(planner).toHaveBeenCalledTimes(0);
    const next = JSON.parse(readText(configPath)) as {
      agents: { list: Array<{ id: string; workspace?: string; workspaceDir?: string }> };
    };
    const normalizedLawclawMain = next.agents.list.find((item) => item.id === 'lawclaw-main');
    expect(normalizedLawclawMain?.workspace).toBe('~/.openclaw/workspace-lawclaw-main');
    expect(normalizedLawclawMain).not.toHaveProperty('workspaceDir');
  });

  it('模板 hash 变化时会再次迁移并更新 v_current hash', async () => {
    const fixture = createFixture();

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner: async () => ({
        schemaVersion: 1,
        decision: 'apply',
        files: [],
      }),
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    const oldHash = JSON.parse(
      readText(join(fixture.lawclawDir, 'agent-presets', 'v_current', 'meta.json'))
    ).presetHash as string;

    const updatedSoul = `${fixture.templateLawclawSoul}\n\n<!-- LAWCLAW_CAPABILITY_START:new-cap -->\nnew cap\n<!-- LAWCLAW_CAPABILITY_END:new-cap -->\n`;
    writeText(
      join(fixture.resourcesDir, 'agent-presets', 'template', 'workspaces', 'lawclaw-main', 'SOUL.md'),
      updatedSoul
    );

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner: async () => ({
        schemaVersion: 1,
        decision: 'apply',
        files: [],
      }),
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    const newHash = JSON.parse(
      readText(join(fixture.lawclawDir, 'agent-presets', 'v_current', 'meta.json'))
    ).presetHash as string;
    expect(newHash).not.toBe(oldHash);
    expect(readText(join(fixture.openclawDir, 'workspace-lawclaw-main', 'SOUL.md'))).toContain(
      'LAWCLAW_CAPABILITY_START:new-cap'
    );
  });

  it('保留存量专业 agents（配置与工作区），迁移不做清理', async () => {
    const fixture = createFixture();
    writeText(
      join(fixture.openclawDir, 'openclaw.json'),
      JSON.stringify(
        {
          agents: {
            list: [
              {
                id: 'main',
                subagents: {
                  allowAgents: ['legal-research', 'contract-review', 'litigation-strategy'],
                },
              },
              { id: 'lawclaw-main' },
              { id: 'legal-research' },
              { id: 'contract-review' },
              { id: 'litigation-strategy' },
            ],
            defaults: {
              subagents: {
                allowAgents: ['legal-research', 'contract-review', 'litigation-strategy'],
              },
            },
          },
        },
        null,
        2
      )
    );
    const specialistDirs = ['legal-research', 'contract-review', 'litigation-strategy'];
    for (const id of specialistDirs) {
      writeText(join(fixture.openclawDir, `workspace-${id}`, 'SOUL.md'), `# ${id}`);
    }

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner: async () => ({
        schemaVersion: 1,
        decision: 'apply',
        files: [],
      }),
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    const config = JSON.parse(readText(join(fixture.openclawDir, 'openclaw.json')));
    const ids = (config.agents.list as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain('lawclaw-main');
    expect(ids).toContain('legal-research');
    expect(ids).toContain('contract-review');
    expect(ids).toContain('litigation-strategy');

    const mainAgent = (config.agents.list as Array<{ id: string; subagents?: { allowAgents?: string[] } }>).find(
      (item) => item.id === 'main'
    );
    expect(mainAgent?.subagents?.allowAgents).toEqual([
      'legal-research',
      'contract-review',
      'litigation-strategy',
    ]);
    expect(config.agents.defaults.subagents.allowAgents).toEqual([
      'legal-research',
      'contract-review',
      'litigation-strategy',
    ]);

    for (const id of specialistDirs) {
      expect(existsSync(join(fixture.openclawDir, `workspace-${id}`))).toBe(true);
    }

    const backupDir = join(fixture.lawclawDir, 'agent-presets', 'backups');
    if (existsSync(backupDir)) {
      const entries = readdirSync(backupDir);
      expect(entries.some((entry) => entry.includes('specialist-agents.json'))).toBe(false);
      expect(entries.some((entry) => entry.includes('legal-research-workspace'))).toBe(false);
      expect(entries.some((entry) => entry.includes('contract-review-workspace'))).toBe(false);
      expect(entries.some((entry) => entry.includes('litigation-strategy-workspace'))).toBe(false);
    }
  });

  it('lawclaw-main 缺少 model 时会补齐且不改全局 defaults.model', async () => {
    const fixture = createFixture();
    writeText(
      join(fixture.openclawDir, 'openclaw.json'),
      JSON.stringify(
        {
          agents: {
            defaults: {
              model: {
                primary: 'openai/gpt-5.2',
              },
            },
            list: [
              {
                id: 'lawclaw-main',
                name: 'LawClaw 主智能体',
              },
            ],
          },
        },
        null,
        2
      )
    );

    // 模拟旧模板不包含 model 字段，验证运行时兜底逻辑。
    writeText(
      join(fixture.resourcesDir, 'agent-presets', 'template', 'openclaw.patch.json'),
      JSON.stringify(
        {
          agents: {
            list: [{ id: 'lawclaw-main', name: 'LawClaw 主智能体' }],
          },
        },
        null,
        2
      )
    );

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner: async () => ({
        schemaVersion: 1,
        decision: 'apply',
        files: [],
      }),
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    const config = JSON.parse(readText(join(fixture.openclawDir, 'openclaw.json')));
    const lawclawMain = (config.agents.list as Array<{ id: string; model?: { primary?: string } }>).find(
      (item) => item.id === 'lawclaw-main'
    );
    expect(lawclawMain?.model?.primary).toBe('jurismind/kimi-k2.5');
    expect(config.agents.defaults.model.primary).toBe('openai/gpt-5.2');
  });

  it('lawclaw-main 已有 model.primary 时保持原值', async () => {
    const fixture = createFixture();
    writeText(
      join(fixture.openclawDir, 'openclaw.json'),
      JSON.stringify(
        {
          agents: {
            defaults: {
              model: {
                primary: 'openai/gpt-5.2',
              },
            },
            list: [
              {
                id: 'lawclaw-main',
                name: 'LawClaw 主智能体',
                model: {
                  primary: 'moonshot/kimi-k2.5',
                },
              },
            ],
          },
        },
        null,
        2
      )
    );

    writeText(
      join(fixture.resourcesDir, 'agent-presets', 'template', 'openclaw.patch.json'),
      JSON.stringify(
        {
          agents: {
            list: [{ id: 'lawclaw-main', name: 'LawClaw 主智能体' }],
          },
        },
        null,
        2
      )
    );

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner: async () => ({
        schemaVersion: 1,
        decision: 'apply',
        files: [],
      }),
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    const config = JSON.parse(readText(join(fixture.openclawDir, 'openclaw.json')));
    const lawclawMain = (config.agents.list as Array<{ id: string; model?: { primary?: string } }>).find(
      (item) => item.id === 'lawclaw-main'
    );
    expect(lawclawMain?.model?.primary).toBe('moonshot/kimi-k2.5');
    expect(config.agents.defaults.model.primary).toBe('openai/gpt-5.2');
  });

  it('lawclaw-main workspace 会被强制为专用目录，并清理 legacy workspaceDir', async () => {
    const fixture = createFixture();
    writeText(
      join(fixture.openclawDir, 'openclaw.json'),
      JSON.stringify(
        {
          agents: {
            list: [
              {
                id: 'lawclaw-main',
                name: 'LawClaw 主智能体',
                workspace: 'C:\\Users\\umx_a\\.openclaw\\workspace',
                workspaceDir: 'C:\\Users\\umx_a\\Downloads\\README\\README',
              },
            ],
          },
        },
        null,
        2
      )
    );

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner: async () => ({
        schemaVersion: 1,
        decision: 'apply',
        files: [],
      }),
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    const config = JSON.parse(
      readText(join(fixture.openclawDir, 'openclaw.json'))
    ) as {
      agents: { list: Array<{ id: string; workspace?: string; workspaceDir?: string }> };
    };
    const lawclawMain = config.agents.list.find((item) => item.id === 'lawclaw-main');
    expect(lawclawMain?.workspace).toBe('~/.openclaw/workspace-lawclaw-main');
    expect(lawclawMain).not.toHaveProperty('workspaceDir');
  });

  it('planner configPatch 尝试改写 workspace 时会被回正为专用目录', async () => {
    const fixture = createFixture();

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner: async () => ({
        schemaVersion: 1,
        decision: 'apply',
        files: [],
        configPatch: {
          agents: {
            list: [
              {
                id: 'lawclaw-main',
                workspace: 'C:\\Users\\umx_a\\.openclaw\\workspace',
              },
            ],
          },
        },
      }),
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    const config = JSON.parse(
      readText(join(fixture.openclawDir, 'openclaw.json'))
    ) as {
      agents: { list: Array<{ id: string; workspace?: string }> };
    };
    const lawclawMain = config.agents.list.find((item) => item.id === 'lawclaw-main');
    expect(lawclawMain?.workspace).toBe('~/.openclaw/workspace-lawclaw-main');
  });

  it('planner 默认会话 key 使用 agent:lawclaw-main 前缀', async () => {
    const fixture = createFixture();
    const sendCalls: unknown[] = [];

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner: vi.fn(),
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    writeText(
      join(fixture.resourcesDir, 'agent-presets', 'template', 'workspaces', 'lawclaw-main', 'SOUL.md'),
      `${fixture.templateLawclawSoul}\n\n<!-- LAWCLAW_CAPABILITY_START:session-key-test -->\nnew\n<!-- LAWCLAW_CAPABILITY_END:session-key-test -->`
    );

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner: undefined,
      gatewayRpc: async (method, params) => {
        if (method === 'chat.send') {
          sendCalls.push(params);
          return { ok: true };
        }
        if (method === 'chat.history') {
          return {
            messages: [
              {
                role: 'assistant',
                content: '```json\n{"schemaVersion":1,"decision":"apply","files":[]}\n```',
              },
            ],
          };
        }
        throw new Error(`unexpected rpc method: ${method}`);
      },
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    expect(sendCalls.length).toBeGreaterThan(0);
    const firstParams = sendCalls[0] as { sessionKey?: string };
    expect(firstParams.sessionKey).toMatch(/^agent:lawclaw-main:__internal_migration__:/);
  });

  it('forceLawclawAgentPreset + 模型不可用时，会立即覆盖 lawclaw-main 并保留队列任务', async () => {
    const fixture = createFixture();
    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner: vi.fn(),
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });
    writeText(
      join(fixture.resourcesDir, 'agent-presets', 'template', 'workspaces', 'lawclaw-main', 'SOUL.md'),
      `${fixture.templateLawclawSoul}\n\n<!-- LAWCLAW_CAPABILITY_START:force-fallback-test -->\nnew\n<!-- LAWCLAW_CAPABILITY_END:force-fallback-test -->`
    );
    writeText(join(fixture.openclawDir, 'workspace-lawclaw-main', 'SOUL.md'), '# custom lawclaw-main');

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      forceLawclawAgentPreset: true,
      planner: vi.fn().mockRejectedValue(new Error('model unavailable')),
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    expect(readText(join(fixture.openclawDir, 'workspace-lawclaw-main', 'SOUL.md'))).toContain(
      'v2 lawclaw-main'
    );

    const backupDir = join(fixture.lawclawDir, 'agent-presets', 'backups');
    expect(existsSync(backupDir)).toBe(true);
    expect(readdirSync(backupDir).length).toBeGreaterThan(0);

    const queue = readAgentPresetQueue(join(fixture.lawclawDir, 'agent-presets', 'queue.json'));
    expect(queue.tasks.length).toBe(1);
    expect(queue.tasks[0].reason).toBe('LLM_UNAVAILABLE');
  });

  it('模型恢复后手动重试成功会出队', async () => {
    const fixture = createFixture();
    const flakyPlanner = vi
      .fn()
      .mockRejectedValueOnce(new Error('model unavailable'))
      .mockResolvedValue({
        schemaVersion: 1,
        decision: 'apply',
        files: [],
      });

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner: flakyPlanner,
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    await retryAgentPresetMigrationNow();

    const queue = readAgentPresetQueue(join(fixture.lawclawDir, 'agent-presets', 'queue.json'));
    expect(queue.tasks.length).toBe(0);
    expect(readText(join(fixture.openclawDir, 'workspace-lawclaw-main', 'SOUL.md'))).toContain(
      'v2 lawclaw-main'
    );
  });

  it('bootstrap should copy presets directly without planner', async () => {
    const fixture = createFixture();
    const planner = vi.fn();
    const soulPath = join(fixture.openclawDir, 'workspace-lawclaw-main', 'SOUL.md');
    writeText(soulPath, '# custom soul');

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner,
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    expect(planner).not.toHaveBeenCalled();
    expect(readText(soulPath)).toContain('v2 lawclaw-main');

    const backupDir = join(fixture.lawclawDir, 'agent-presets', 'backups');
    expect(existsSync(backupDir)).toBe(true);
    expect(readdirSync(backupDir).length).toBeGreaterThan(0);
  });

  it('treat missing v_current as bootstrap even when state.currentHash exists', async () => {
    const fixture = createFixture();
    const planner = vi.fn();
    writeText(
      join(fixture.lawclawDir, 'agent-presets', 'state.json'),
      JSON.stringify(
        {
          schemaVersion: 2,
          currentHash: 'from-state-only',
          updateHash: 'from-state-only',
          managedFiles: {},
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner,
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    expect(planner).not.toHaveBeenCalled();
    expect(existsSync(join(fixture.lawclawDir, 'agent-presets', 'v_current', 'meta.json'))).toBe(true);
  });

  it('running keeps chat unlocked while awaiting_confirmation locks chat', async () => {
    const fixture = createFixture();

    await runAgentPresetStartupMigration({
      resourcesDir: fixture.resourcesDir,
      openClawConfigDir: fixture.openclawDir,
      clawXConfigDir: fixture.lawclawDir,
      planner: vi.fn(),
      isGatewayRunning: () => true,
      heartbeatIntervalMs: 60_000,
    });

    writeText(
      join(fixture.resourcesDir, 'agent-presets', 'template', 'workspaces', 'lawclaw-main', 'SOUL.md'),
      `${fixture.templateLawclawSoul}

<!-- LAWCLAW_CAPABILITY_START:status-test -->
status test
<!-- LAWCLAW_CAPABILITY_END:status-test -->`
    );

    const statuses: Array<{ state: string; chatLocked: boolean }> = [];
    const off = onAgentPresetMigrationStatus((status) => {
      statuses.push({ state: status.state, chatLocked: status.chatLocked });
    });

    try {
      await runAgentPresetStartupMigration({
        resourcesDir: fixture.resourcesDir,
        openClawConfigDir: fixture.openclawDir,
        clawXConfigDir: fixture.lawclawDir,
        planner: vi.fn().mockResolvedValue({
          schemaVersion: 1,
          decision: 'need_confirmation',
          files: [],
        }),
        isGatewayRunning: () => true,
        heartbeatIntervalMs: 60_000,
      });
    } finally {
      off();
    }

    expect(statuses.some((item) => item.state === 'running' && item.chatLocked === false)).toBe(true);
    const latest = getAgentPresetMigrationStatus();
    expect(latest.state).toBe('awaiting_confirmation');
    expect(latest.chatLocked).toBe(true);
  });

});
