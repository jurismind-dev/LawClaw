import { describe, expect, it } from 'vitest';
import enSetup from '@/i18n/locales/en/setup.json';
import zhSetup from '@/i18n/locales/zh/setup.json';

function collectClawXPaths(value: unknown, basePath = ''): string[] {
  if (typeof value === 'string') {
    return value.includes('ClawX') ? [basePath || '(root)'] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectClawXPaths(item, `${basePath}[${index}]`));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, nested]) =>
      collectClawXPaths(nested, basePath ? `${basePath}.${key}` : key)
    );
  }

  return [];
}

describe('setup branding copy', () => {
  it('does not use the old ClawX product name in setup locales', () => {
    const locales: Array<{ lang: string; data: unknown }> = [
      { lang: 'en', data: enSetup },
      { lang: 'zh', data: zhSetup },
    ];

    const findings = locales.flatMap(({ lang, data }) =>
      collectClawXPaths(data).map((path) => `${lang}:${path}`)
    );

    expect(findings).toEqual([]);
  });
});
