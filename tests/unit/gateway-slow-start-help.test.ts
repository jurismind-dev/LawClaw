import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GATEWAY_SLOW_START_GUIDE_URL } from '@/lib/gateway-support';
import enSetup from '@/i18n/locales/en/setup.json';
import zhSetup from '@/i18n/locales/zh/setup.json';
import jaSetup from '@/i18n/locales/ja/setup.json';
import enSettings from '@/i18n/locales/en/settings.json';
import zhSettings from '@/i18n/locales/zh/settings.json';
import jaSettings from '@/i18n/locales/ja/settings.json';

function readRepoFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8');
}

describe('gateway slow-start help', () => {
  it('uses the configured Feishu guide URL', () => {
    expect(GATEWAY_SLOW_START_GUIDE_URL).toBe(
      'https://pcnz0er969s1.feishu.cn/wiki/IJLmwaiy0iIbqikqB9vcvZTinMc#share-Vkm7dHtJAoJNX2x9nvjcBABrnr3'
    );
  });

  it('includes localized copy for setup and settings', () => {
    expect(enSetup.runtime.slowStartHelp.action).toBeTruthy();
    expect(zhSetup.runtime.slowStartHelp.action).toBeTruthy();
    expect(jaSetup.runtime.slowStartHelp.action).toBeTruthy();
    expect(enSettings.gateway.slowStartHelp.action).toBeTruthy();
    expect(zhSettings.gateway.slowStartHelp.action).toBeTruthy();
    expect(jaSettings.gateway.slowStartHelp.action).toBeTruthy();
  });

  it('wires the guide into setup and settings pages', () => {
    const setupSource = readRepoFile('src/pages/Setup/index.tsx');
    const settingsSource = readRepoFile('src/pages/Settings/index.tsx');

    expect(setupSource).toContain('GATEWAY_SLOW_START_GUIDE_URL');
    expect(setupSource).toContain('runtime.slowStartHelp');
    expect(settingsSource).toContain('GATEWAY_SLOW_START_GUIDE_URL');
    expect(settingsSource).toContain('gateway.slowStartHelp');
  });
});
