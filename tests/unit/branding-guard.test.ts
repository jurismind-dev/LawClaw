import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import enChat from '@/i18n/locales/en/chat.json';
import enSkills from '@/i18n/locales/en/skills.json';
import enSettings from '@/i18n/locales/en/settings.json';
import jaChat from '@/i18n/locales/ja/chat.json';
import jaSkills from '@/i18n/locales/ja/skills.json';
import jaSettings from '@/i18n/locales/ja/settings.json';
import zhChat from '@/i18n/locales/zh/chat.json';
import zhSkills from '@/i18n/locales/zh/skills.json';
import zhSettings from '@/i18n/locales/zh/settings.json';

type SkillsLocale = {
  tabs?: { clawhub?: string; jurismindhub?: string };
  filter?: { clawhub?: string; jurismindhub?: string };
  clawhub?: { securityNote?: string };
  jurismindhub?: { securityNote?: string };
};

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

  it('defines split market keys for clawhub and jurismindhub locales', () => {
    const locales: Array<{ name: string; data: SkillsLocale }> = [
      { name: 'en.skills', data: enSkills },
      { name: 'zh.skills', data: zhSkills },
      { name: 'ja.skills', data: jaSkills },
    ];

    for (const locale of locales) {
      expect(locale.data.tabs.clawhub).toBeTruthy();
      expect(locale.data.tabs.jurismindhub).toBeTruthy();
      expect(locale.data.filter.clawhub).toBeTruthy();
      expect(locale.data.filter.jurismindhub).toBeTruthy();
      expect(locale.data.clawhub.securityNote).toBeTruthy();
      expect(locale.data.jurismindhub.securityNote).toBeTruthy();
    }
  });

  it('uses JurisHub naming in skills locales', () => {
    const locales: Array<{ name: string; data: unknown }> = [
      { name: 'en.skills', data: enSkills },
      { name: 'zh.skills', data: zhSkills },
      { name: 'ja.skills', data: jaSkills },
    ];

    for (const locale of locales) {
      const legacyPaths = collectTermPaths(locale.data, 'JurismindHub');
      const newBrandPaths = collectTermPaths(locale.data, 'JurisHub');
      expect(legacyPaths, `${locale.name} still contains legacy brand`).toEqual([]);
      expect(newBrandPaths.length, `${locale.name} should contain new brand`).toBeGreaterThan(0);
    }
  });

  it('renders JurisHub tab before ClawHub and uses jurismind icon asset', () => {
    const skillsPageSource = readFileSync(resolve(process.cwd(), 'src/pages/Skills/index.tsx'), 'utf8');
    const jurishubTab = skillsPageSource.indexOf('<TabsTrigger value="jurismindhub"');
    const clawhubTab = skillsPageSource.indexOf('<TabsTrigger value="clawhub"');

    expect(skillsPageSource).toContain("from '@/assets/jurismind.svg'");
    expect(jurishubTab).toBeGreaterThan(-1);
    expect(clawhubTab).toBeGreaterThan(-1);
    expect(jurishubTab).toBeLessThan(clawhubTab);
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
