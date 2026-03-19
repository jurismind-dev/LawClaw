import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8');
}

describe('jurismind connector auto-approve flow', () => {
  it('passes openclaw cli paths into the connector runtime env', () => {
    const source = readRepoFile('electron/utils/jurismind-connector.ts');

    expect(source).toContain("OPENCLAW_CLI_ENTRY_PATH: getOpenClawEntryPath()");
    expect(source).toContain("OPENCLAW_CLI_NODE_EXEC_PATH: getNodeExecForCli()");
    expect(source).toContain("OPENCLAW_NO_RESPAWN: '1'");
    expect(source).toContain("OPENCLAW_EMBEDDED_IN: 'LawClaw'");
  });

  it('auto-approves local pairing-required requests and retries the gateway connect', () => {
    const source = readRepoFile('connector-runtime/index.js');

    expect(source).toContain('async function tryAutoApproveLocalPairing()');
    expect(source).toContain("runOpenClawCli(['devices', 'list', '--json'])");
    expect(source).toContain("runOpenClawCli(['devices', 'approve', requestId, '--json'])");
    expect(source).toContain("cleanupLocalSession(sid, { notifyRelay: false, reason: 'retry-after-auto-approve' })");
    expect(source).toContain("log.info('本机设备配对已批准，正在重试连接本地 Gateway。')");
  });
});
