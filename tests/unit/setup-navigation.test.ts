import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import enSetup from '@/i18n/locales/en/setup.json';
import jaSetup from '@/i18n/locales/ja/setup.json';
import zhSetup from '@/i18n/locales/zh/setup.json';

function readSetupSource(): string {
  return readFileSync(join(process.cwd(), 'src/pages/Setup/index.tsx'), 'utf-8');
}

describe('setup navigation and install flow', () => {
  it('does not expose a global skip-setup action in the setup UI or locales', () => {
    const source = readSetupSource();

    expect(source).not.toContain("t('nav.skipSetup')");
    expect(source).not.toContain("t('installing.skip')");
    expect(source).not.toContain('const handleSkip =');
    expect(source).not.toContain('onSkip={');
    expect(enSetup.nav).not.toHaveProperty('skipSetup');
    expect(jaSetup.nav).not.toHaveProperty('skipSetup');
    expect(zhSetup.nav).not.toHaveProperty('skipSetup');
    expect(enSetup.installing).not.toHaveProperty('skip');
    expect(jaSetup.installing).not.toHaveProperty('skip');
    expect(zhSetup.installing).not.toHaveProperty('skip');
  });

  it('still triggers preset install during the setup installing step', () => {
    const source = readSetupSource();

    expect(source).toContain("'presetInstall:run'");
    expect(source).toContain("{ phase: 'setup' }");
  });

  it('removes QQbot from the setup channel picker and uses Feishu QR onboarding instead of bundled install', () => {
    const source = readSetupSource();

    expect(source).toContain("getPrimaryChannels().filter((type) => type !== 'qqbot')");
    expect(source).toContain("<FeishuOfficialOnboardingPanel");
    expect(source).not.toContain("SETUP_BUNDLED_FEISHU_PLUGIN_ID");
    expect(source).not.toContain("'openclaw:installBundledPlugin'");
  });
});
