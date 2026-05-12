import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import enSetup from '@/i18n/locales/en/setup.json';
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
    expect(zhSetup.nav).not.toHaveProperty('skipSetup');
    expect(enSetup.installing).not.toHaveProperty('skip');
    expect(zhSetup.installing).not.toHaveProperty('skip');
  });

  it('still triggers preset install during the setup installing step', () => {
    const source = readSetupSource();

    expect(source).toContain("'presetInstall:run'");
    expect(source).toContain("{ phase: 'setup' }");
  });

  it('uses the dedicated QR onboarding panels for setup channels', () => {
    const source = readSetupSource();

    expect(source).toContain('const primaryChannels = getPrimaryChannels();');
    expect(source).not.toContain("type !== 'qqbot'");
    expect(source).toContain("<FeishuOfficialOnboardingPanel");
    expect(source).toContain("<WeixinOnboardingPanel");
    expect(source).not.toContain("SETUP_BUNDLED_FEISHU_PLUGIN_ID");
    expect(source).not.toContain("'openclaw:installBundledPlugin'");
  });

  it('forces Jurismind to become the active model only when Setup binds Jurismind', () => {
    const source = readSetupSource();

    expect(source).toContain("const setupDefaultSyncPolicy = selectedProvider === 'jurismind' ? 'always' : 'if-empty';");
    expect(source).toContain('syncPolicy: setupDefaultSyncPolicy');
    expect(source).toContain("t('settings:aiProviders.jurismind.loginAndBind')");
    expect(source).toContain("t('settings:aiProviders.jurismind.binding')");
  });
});
