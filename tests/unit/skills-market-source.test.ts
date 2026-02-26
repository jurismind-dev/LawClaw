import { describe, expect, it } from 'vitest';
import {
  CLAWHUB_SITE_URL,
  CLAWHUB_REGISTRY_URL,
  JURISMINDHUB_SITE_URL,
  JURISMINDHUB_REGISTRY_URL,
  detectInstallSourceFromRegistry,
  resolveSkillPageUrl,
} from '@electron/gateway/market-source';

describe('skills market source', () => {
  it('exposes locked market endpoints', () => {
    expect(CLAWHUB_SITE_URL).toBe('https://clawhub.ai');
    expect(CLAWHUB_REGISTRY_URL).toBe('https://clawhub.ai');
    expect(JURISMINDHUB_SITE_URL).toBe('http://192.168.31.145:3000');
    expect(JURISMINDHUB_REGISTRY_URL).toBe('https://calculating-salmon-931.convex.site');
  });

  it('detects install source from registry url', () => {
    expect(detectInstallSourceFromRegistry('https://clawhub.ai')).toBe('clawhub');
    expect(detectInstallSourceFromRegistry('https://auth.clawhub.ai')).toBe('clawhub');
    expect(detectInstallSourceFromRegistry('https://calculating-salmon-931.convex.site')).toBe(
      'jurismindhub'
    );
    expect(detectInstallSourceFromRegistry('https://example.com')).toBe('unknown');
    expect(detectInstallSourceFromRegistry(undefined)).toBe('unknown');
  });

  it('resolves skill page url per market', () => {
    expect(resolveSkillPageUrl('clawhub', 'legal-assistant')).toBe(
      'https://clawhub.ai/s/legal-assistant'
    );
    expect(resolveSkillPageUrl('jurismindhub', 'legal-assistant')).toBe(
      'http://192.168.31.145:3000/s/legal-assistant'
    );
  });
});
