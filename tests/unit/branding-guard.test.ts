import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import enChat from '@/i18n/locales/en/chat.json';
import enSettings from '@/i18n/locales/en/settings.json';
import jaChat from '@/i18n/locales/ja/chat.json';
import jaSettings from '@/i18n/locales/ja/settings.json';
import zhChat from '@/i18n/locales/zh/chat.json';
import zhSettings from '@/i18n/locales/zh/settings.json';

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

describe('branding guard', () => {
  it('does not use ClawX in settings/chat locale copy', () => {
    const locales: Array<{ name: string; data: unknown }> = [
      { name: 'en.settings', data: enSettings },
      { name: 'zh.settings', data: zhSettings },
      { name: 'ja.settings', data: jaSettings },
      { name: 'en.chat', data: enChat },
      { name: 'zh.chat', data: zhChat },
      { name: 'ja.chat', data: jaChat },
    ];

    const findings = locales.flatMap(({ name, data }) =>
      collectTermPaths(data, 'ClawX').map((path) => `${name}:${path}`)
    );

    expect(findings).toEqual([]);
  });

  it('uses LawClaw naming in tray labels and tooltip', () => {
    const traySource = readFileSync(resolve(process.cwd(), 'electron/main/tray.ts'), 'utf8');
    expect(traySource).not.toContain('ClawX - AI Assistant');
    expect(traySource).not.toContain('Show ClawX');
    expect(traySource).not.toContain('Quit ClawX');
    expect(traySource).toContain('LawClaw - AI Assistant');
    expect(traySource).toContain('Show LawClaw');
    expect(traySource).toContain('Quit LawClaw');
  });
});
