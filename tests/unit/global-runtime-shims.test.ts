import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
  },
}));

vi.mock('@electron/utils/paths', () => ({
  getClawXConfigDir: vi.fn(() => '/Users/test/.LawClaw'),
}));

vi.mock('@electron/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('global runtime shims helpers', () => {
  it('appends and removes PATH entries without disturbing unrelated values', async () => {
    const mod = await import('@electron/utils/global-runtime-shims');

    expect(
      mod.appendPathEntry('/usr/bin:/bin', '/Users/test/.LawClaw/bin', 'darwin')
    ).toBe('/usr/bin:/bin:/Users/test/.LawClaw/bin');

    expect(
      mod.appendPathEntry('/usr/bin:/Users/test/.LawClaw/bin:/bin', '/Users/test/.LawClaw/bin', 'darwin')
    ).toBe('/usr/bin:/bin:/Users/test/.LawClaw/bin');

    expect(
      mod.removePathEntry('/usr/bin:/Users/test/.LawClaw/bin:/bin', '/Users/test/.LawClaw/bin', 'darwin')
    ).toBe('/usr/bin:/bin');

    expect(
      mod.appendPathEntry('C:\\Windows;C:\\Users\\test\\.LawClaw\\bin', 'C:\\Users\\test\\.LawClaw\\bin', 'win32')
    ).toBe('C:\\Windows;C:\\Users\\test\\.LawClaw\\bin');

    expect(
      mod.removePathEntry('C:\\Windows;C:\\Users\\test\\.LawClaw\\bin', 'C:\\Users\\test\\.LawClaw\\bin', 'win32')
    ).toBe('C:\\Windows');
  });

  it('creates and removes a single shell marker block', async () => {
    const mod = await import('@electron/utils/global-runtime-shims');
    const block = mod.getPosixShellMarkerBlock();
    const original = 'export PATH="/usr/local/bin:$PATH"\n';

    const withBlock = mod.upsertMarkerBlock(original, block);
    expect(withBlock).toContain(mod.LAWCLAW_GLOBAL_TOOLS_START_MARKER);
    expect(withBlock).toContain('$HOME/.LawClaw/support/global-tools/env.sh');
    expect(withBlock.match(/LawClaw Global Tools/g)?.length).toBe(2);

    const updatedAgain = mod.upsertMarkerBlock(withBlock, block);
    expect(updatedAgain).toBe(withBlock);

    const removed = mod.removeMarkerBlock(withBlock);
    expect(removed).toContain('export PATH="/usr/local/bin:$PATH"');
    expect(removed).not.toContain(mod.LAWCLAW_GLOBAL_TOOLS_START_MARKER);
    expect(removed).not.toContain(mod.LAWCLAW_GLOBAL_TOOLS_END_MARKER);
  });

  it('builds shell env and shim wrappers that point to LawClaw-managed tools', async () => {
    const mod = await import('@electron/utils/global-runtime-shims');

    const envScript = mod.buildPosixEnvScript();
    expect(envScript).toContain('LAWCLAW_SKIP_GLOBAL_SHIMS');
    expect(envScript).toContain('$HOME/.LawClaw/bin');
    expect(envScript).toContain('export PATH="${PATH}:${LAWCLAW_GLOBAL_TOOLS_DIR}"');

    const cmdShim = mod.buildWindowsShimContent('C:\\Program Files\\LawClaw\\resources\\runtime-bridge\\python.cmd');
    expect(cmdShim).toContain('call "C:\\Program Files\\LawClaw\\resources\\runtime-bridge\\python.cmd" %*');
    expect(cmdShim).toContain('chcp 65001');

    const exeShim = mod.buildWindowsShimContent('C:\\Program Files\\LawClaw\\resources\\bin\\uv.exe');
    expect(exeShim).toContain('"C:\\Program Files\\LawClaw\\resources\\bin\\uv.exe" %*');
    expect(exeShim).not.toContain('call "C:\\Program Files\\LawClaw\\resources\\bin\\uv.exe"');

    const posixShim = mod.buildPosixShimContent('/Applications/LawClaw.app/Contents/Resources/runtime-bridge/python');
    expect(posixShim).toContain('exec \'/Applications/LawClaw.app/Contents/Resources/runtime-bridge/python\' "$@"');
  });
});
