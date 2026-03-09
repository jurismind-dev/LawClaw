import { describe, expect, it } from 'vitest';
import enSetup from '@/i18n/locales/en/setup.json';
import jaSetup from '@/i18n/locales/ja/setup.json';
import zhSetup from '@/i18n/locales/zh/setup.json';

function collectTermPaths(value: unknown, term: string, basePath = ''): string[] {
  if (typeof value === 'string') {
    return value.includes(term) ? [basePath || '(root)'] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectTermPaths(item, term, `${basePath}[${index}]`));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, nested]) =>
      collectTermPaths(nested, term, basePath ? `${basePath}.${key}` : key)
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
      collectTermPaths(data, 'ClawX').map((path) => `${lang}:${path}`)
    );

    expect(findings).toEqual([]);
  });

  it('does not use the legacy 小龙芯 product name in setup locales', () => {
    const locales: Array<{ lang: string; data: unknown }> = [
      { lang: 'en', data: enSetup },
      { lang: 'zh', data: zhSetup },
      { lang: 'ja', data: jaSetup },
    ];

    const findings = locales.flatMap(({ lang, data }) =>
      collectTermPaths(data, '小龙芯').map((path) => `${lang}:${path}`)
    );

    expect(findings).toEqual([]);
  });

  it('uses 劳有钳 naming in zh setup locale', () => {
    const findings = collectTermPaths(zhSetup, '劳有钳');
    expect(findings.length).toBeGreaterThan(0);
  });
});
