import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { parseJsonText } from '@electron/utils/text-encoding';
import {
  runAgentPresetStartupMigration,
  stopAgentPresetMigrationCoordinator,
} from '@electron/utils/agent-preset-migration';

interface PresetAgent {
  id?: string;
  name?: string;
  workspace?: string;
  default?: boolean;
  runtime?: {
    type?: string;
    acp?: {
      agent?: string;
      backend?: string;
      mode?: string;
      cwd?: string;
    };
  };
}

interface AcpxPluginConfig {
  permissionMode?: string;
  nonInteractivePermissions?: string;
  timeoutSeconds?: number;
  agents?: Record<string, unknown>;
}

interface AcpxPluginEntry {
  enabled?: boolean;
  config?: AcpxPluginConfig;
}

interface PatchShape {
  agents?: { list?: PresetAgent[] };
  acp?: {
    enabled?: boolean;
    dispatch?: { enabled?: boolean };
    backend?: string;
    defaultAgent?: string;
    allowedAgents?: string[];
  };
  plugins?: { entries?: { acpx?: AcpxPluginEntry } };
}

const PATCH_PATH = join(
  process.cwd(),
  'resources',
  'agent-presets',
  'template',
  'openclaw.patch.json'
);

// Mirrors plugin-sdk schema in
// node_modules/openclaw/dist/extensions/acpx/openclaw.plugin.json (configSchema).
const ACPX_PERMISSION_MODE_ENUM = ['approve-all', 'approve-reads', 'deny-all'];
const ACPX_NON_INTERACTIVE_ENUM = ['deny', 'fail'];

function readPatch(): PatchShape {
  return parseJsonText<PatchShape>(readFileSync(PATCH_PATH, 'utf-8'));
}

const JURISMIND_AGENT_ID = 'lawclaw-jurismind-xhigh';
const JURISMIND_AGENT_NAME = 'Jurismind xHigh';
const JURISMIND_AGENT_WORKSPACE = '~/.openclaw/workspace-lawclaw-jurismind-xhigh';
const JURISMIND_ACP_ALIAS = 'jurismind-xhigh';

describe('openclaw acpx jurismind preset patch', () => {
  it('parses as JSON (BOM tolerated by parseJsonText)', () => {
    expect(() => readPatch()).not.toThrow();
  });

  it('declares the Jurismind xHigh agent with a schema-valid ACP runtime config', () => {
    const patch = readPatch();
    const jurismind = patch.agents?.list?.find((item) => item.id === JURISMIND_AGENT_ID);
    expect(jurismind).toBeDefined();
    expect(jurismind?.name).toBe(JURISMIND_AGENT_NAME);
    expect(jurismind?.workspace).toBe(JURISMIND_AGENT_WORKSPACE);
    expect(jurismind?.runtime).toEqual({
      type: 'acp',
      acp: {
        agent: JURISMIND_ACP_ALIAS,
        backend: 'acpx',
        mode: 'persistent',
      },
    });
  });

  it('configures top-level ACP policy to target Jurismind xHigh through acpx', () => {
    const patch = readPatch();
    expect(patch.acp?.enabled).toBe(true);
    expect(patch.acp?.dispatch?.enabled).toBe(true);
    expect(patch.acp?.backend).toBe('acpx');
    expect(patch.acp?.defaultAgent).toBe(JURISMIND_ACP_ALIAS);
    expect(patch.acp?.allowedAgents).toContain(JURISMIND_ACP_ALIAS);
  });

  it('does not mark Jurismind xHigh as default (lawclaw-main keeps default ownership)', () => {
    const patch = readPatch();
    const jurismind = patch.agents?.list?.find((item) => item.id === JURISMIND_AGENT_ID);
    const main = patch.agents?.list?.find((item) => item.id === 'lawclaw-main');
    expect(jurismind?.default).not.toBe(true);
    expect(main?.default).toBe(true);
  });

  it('configures acpx plugin with non-interactive ACP-friendly defaults', () => {
    const patch = readPatch();
    const acpx = patch.plugins?.entries?.acpx;
    expect(acpx?.enabled).toBe(true);

    const config = acpx?.config;
    expect(ACPX_PERMISSION_MODE_ENUM).toContain(config?.permissionMode);
    expect(ACPX_NON_INTERACTIVE_ENUM).toContain(config?.nonInteractivePermissions);
    expect(typeof config?.timeoutSeconds).toBe('number');
    expect(config?.timeoutSeconds ?? 0).toBeGreaterThanOrEqual(120);
  });

  it('uses approve-all permissionMode (ACP sessions are non-interactive and need this break-glass)', () => {
    const patch = readPatch();
    expect(patch.plugins?.entries?.acpx?.config?.permissionMode).toBe('approve-all');
  });

  it('defines a Jurismind xHigh acpx alias that launches the Codex ACP adapter', () => {
    const patch = readPatch();
    const agents = patch.plugins?.entries?.acpx?.config?.agents as
      | Record<string, { command?: string }>
      | undefined;
    expect(agents?.[JURISMIND_ACP_ALIAS]?.command).toContain('@zed-industries/codex-acp');
    expect(agents?.[JURISMIND_ACP_ALIAS]?.command).toContain('env -u OPENAI_API_KEY -u CODEX_API_KEY');
  });
});

// End-to-end: run the real agent-preset migration with the real resources tree
// against a temp ~/.openclaw, and verify the merged openclaw.json contains the
// Jurismind xHigh agent and acpx plugin entry.
describe('openclaw acpx jurismind preset (end-to-end migration)', () => {
  const tempDirs: string[] = [];

  function writeText(filePath: string, content: string): void {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf-8');
  }

  function createFixture(): { openclawDir: string; lawclawDir: string } {
    const root = mkdtempSync(join(tmpdir(), 'lawclaw-acpx-jurismind-'));
    tempDirs.push(root);
    const openclawDir = join(root, '.openclaw');
    const lawclawDir = join(root, '.LawClaw');
    writeText(join(openclawDir, 'openclaw.json'), '{}');
    return { openclawDir, lawclawDir };
  }

  afterEach(() => {
    stopAgentPresetMigrationCoordinator();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('merges Jurismind xHigh agent and acpx config into a fresh openclaw.json', async () => {
    const { openclawDir, lawclawDir } = createFixture();

    await runAgentPresetStartupMigration({
      resourcesDir: join(process.cwd(), 'resources'),
      openClawConfigDir: openclawDir,
      clawXConfigDir: lawclawDir,
    });

    const merged = parseJsonText<PatchShape>(
      readFileSync(join(openclawDir, 'openclaw.json'), 'utf-8')
    );

    const jurismind = merged.agents?.list?.find((item) => item.id === JURISMIND_AGENT_ID);
    expect(jurismind).toBeDefined();
    expect(jurismind?.runtime?.type).toBe('acp');
    expect(jurismind?.runtime?.acp?.agent).toBe(JURISMIND_ACP_ALIAS);
    expect(jurismind?.runtime?.acp?.backend).toBe('acpx');
    expect(jurismind?.runtime?.acp?.mode).toBe('persistent');
    expect(merged.acp?.enabled).toBe(true);
    expect(merged.acp?.dispatch?.enabled).toBe(true);
    expect(merged.acp?.backend).toBe('acpx');
    expect(merged.acp?.defaultAgent).toBe(JURISMIND_ACP_ALIAS);
    expect(merged.acp?.allowedAgents).toContain(JURISMIND_ACP_ALIAS);

    const acpx = merged.plugins?.entries?.acpx;
    expect(acpx?.enabled).toBe(true);
    expect(acpx?.config?.permissionMode).toBe('approve-all');
    expect(acpx?.config?.nonInteractivePermissions).toBe('deny');
    expect(acpx?.config?.timeoutSeconds).toBe(180);
    const acpxAgents = acpx?.config?.agents as Record<string, { command?: string }>;
    expect(acpxAgents[JURISMIND_ACP_ALIAS]?.command).toContain('@zed-industries/codex-acp');
    expect(acpxAgents[JURISMIND_ACP_ALIAS]?.command).toContain('env -u OPENAI_API_KEY -u CODEX_API_KEY');
  });

  it('preserves user customizations to acpx config when re-applying preset', async () => {
    const { openclawDir, lawclawDir } = createFixture();

    // Simulate a user who already tightened permissionMode and added a custom timeout.
    const userConfig = {
      plugins: {
        entries: {
          acpx: {
            enabled: true,
            config: {
              permissionMode: 'approve-reads',
              timeoutSeconds: 300,
            },
          },
        },
      },
    };
    writeText(join(openclawDir, 'openclaw.json'), JSON.stringify(userConfig, null, 2));

    await runAgentPresetStartupMigration({
      resourcesDir: join(process.cwd(), 'resources'),
      openClawConfigDir: openclawDir,
      clawXConfigDir: lawclawDir,
    });

    const merged = parseJsonText<PatchShape>(
      readFileSync(join(openclawDir, 'openclaw.json'), 'utf-8')
    );

    // mergeRecordAdditive is additive: existing fields stay, new fields fill in.
    expect(merged.plugins?.entries?.acpx?.config?.permissionMode).toBe('approve-reads');
    expect(merged.plugins?.entries?.acpx?.config?.timeoutSeconds).toBe(300);
    // Our new field is added because the user did not set it.
    expect(merged.plugins?.entries?.acpx?.config?.nonInteractivePermissions).toBe('deny');
    // Jurismind xHigh agent gets injected regardless.
    const jurismind = merged.agents?.list?.find((item) => item.id === JURISMIND_AGENT_ID);
    expect(jurismind).toBeDefined();
    expect(jurismind?.runtime?.type).toBe('acp');
    expect(merged.acp?.defaultAgent).toBe(JURISMIND_ACP_ALIAS);
  });

  it('renames the managed legacy Codex preset and removes schema-invalid ACP runtime', async () => {
    const { openclawDir, lawclawDir } = createFixture();

    const userConfig = {
      agents: {
        list: [
          {
            id: 'lawclaw-codex',
            name: 'LawClaw Codex (ACP)',
            workspace: '~/.openclaw/workspace-lawclaw-codex',
            runtime: {
              type: 'acp',
              acp: {
                agent: 'codex',
                backend: 'acpx',
                mode: 'session',
              },
            },
          },
        ],
      },
    };
    writeText(join(openclawDir, 'openclaw.json'), JSON.stringify(userConfig, null, 2));

    await runAgentPresetStartupMigration({
      resourcesDir: join(process.cwd(), 'resources'),
      openClawConfigDir: openclawDir,
      clawXConfigDir: lawclawDir,
    });

    const merged = parseJsonText<PatchShape>(
      readFileSync(join(openclawDir, 'openclaw.json'), 'utf-8')
    );

    const legacy = merged.agents?.list?.find((item) => item.id === 'lawclaw-codex');
    const jurismind = merged.agents?.list?.find((item) => item.id === JURISMIND_AGENT_ID);
    expect(legacy).toBeUndefined();
    expect(jurismind).toBeDefined();
    expect(jurismind?.name).toBe(JURISMIND_AGENT_NAME);
    expect(jurismind?.workspace).toBe(JURISMIND_AGENT_WORKSPACE);
    expect(jurismind?.runtime?.type).toBe('acp');
    expect(jurismind?.runtime?.acp?.agent).toBe(JURISMIND_ACP_ALIAS);
    expect(merged.acp?.backend).toBe('acpx');
    expect(merged.acp?.defaultAgent).toBe(JURISMIND_ACP_ALIAS);
    expect(merged.acp?.allowedAgents).toContain(JURISMIND_ACP_ALIAS);
  });

  it('preserves schema-valid ACP runtime objects during migration', async () => {
    const { openclawDir, lawclawDir } = createFixture();

    const userConfig = {
      agents: {
        list: [
          {
            id: JURISMIND_AGENT_ID,
            name: JURISMIND_AGENT_NAME,
            workspace: JURISMIND_AGENT_WORKSPACE,
            runtime: {
              type: 'acp',
              acp: {
                agent: JURISMIND_ACP_ALIAS,
                backend: 'acpx',
                mode: 'persistent',
              },
            },
          },
        ],
      },
    };
    writeText(join(openclawDir, 'openclaw.json'), JSON.stringify(userConfig, null, 2));

    await runAgentPresetStartupMigration({
      resourcesDir: join(process.cwd(), 'resources'),
      openClawConfigDir: openclawDir,
      clawXConfigDir: lawclawDir,
    });

    const merged = parseJsonText<PatchShape>(
      readFileSync(join(openclawDir, 'openclaw.json'), 'utf-8')
    );

    const jurismind = merged.agents?.list?.find((item) => item.id === JURISMIND_AGENT_ID);
    expect(jurismind?.runtime).toEqual(userConfig.agents.list[0].runtime);
  });

  it('does not duplicate Jurismind xHigh when migration runs twice', async () => {
    const { openclawDir, lawclawDir } = createFixture();

    await runAgentPresetStartupMigration({
      resourcesDir: join(process.cwd(), 'resources'),
      openClawConfigDir: openclawDir,
      clawXConfigDir: lawclawDir,
    });

    await runAgentPresetStartupMigration({
      resourcesDir: join(process.cwd(), 'resources'),
      openClawConfigDir: openclawDir,
      clawXConfigDir: lawclawDir,
    });

    const merged = parseJsonText<PatchShape>(
      readFileSync(join(openclawDir, 'openclaw.json'), 'utf-8')
    );

    const jurismindCount = merged.agents?.list?.filter((item) => item.id === JURISMIND_AGENT_ID).length;
    expect(jurismindCount).toBe(1);
  });
});
