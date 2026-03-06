/**
 * Skills market constants and source helpers.
 */
export type SkillMarket = 'clawhub' | 'jurismindhub';
export type SkillInstallSource = SkillMarket | 'unknown';

export const CLAWHUB_SITE_URL = 'https://clawhub.ai';
export const CLAWHUB_REGISTRY_URL = 'https://clawhub.ai';

export const JURISMINDHUB_SITE_URL = 'https://lawhub.jurismind.com';
export const JURISMINDHUB_REGISTRY_URL = 'https://lawhub.jurismind.com';
export const JURISMINDHUB_CONVEX_API_URL = 'https://convex-api-lawhub.jurismind.com';
const LEGACY_JURISMIND_REGISTRY_HOSTNAMES = ['calculating-salmon-931.convex.site'];

function normalizeUrl(url?: string): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).toString().replace(/\/+$/, '').toLowerCase();
  } catch {
    return null;
  }
}

function getHostname(url?: string): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isClawHubRegistry(registry?: string): boolean {
  const normalizedRegistry = normalizeUrl(registry);
  const normalizedClawHubRegistry = normalizeUrl(CLAWHUB_REGISTRY_URL);

  if (!normalizedRegistry || !normalizedClawHubRegistry) {
    return false;
  }

  if (normalizedRegistry === normalizedClawHubRegistry) {
    return true;
  }

  const hostname = getHostname(normalizedRegistry);
  if (!hostname) {
    return false;
  }

  return hostname === 'clawhub.ai' || hostname.endsWith('.clawhub.ai');
}

function isJurismindRegistry(registry?: string): boolean {
  const normalizedRegistry = normalizeUrl(registry);
  const normalizedJurismindRegistry = normalizeUrl(JURISMINDHUB_REGISTRY_URL);

  if (!normalizedRegistry || !normalizedJurismindRegistry) {
    return false;
  }

  if (normalizedRegistry === normalizedJurismindRegistry) {
    return true;
  }

  const hostname = getHostname(normalizedRegistry);
  const jurismindHostname = getHostname(normalizedJurismindRegistry);

  return Boolean(
    hostname &&
      jurismindHostname &&
      (hostname === jurismindHostname || LEGACY_JURISMIND_REGISTRY_HOSTNAMES.includes(hostname))
  );
}

export function detectInstallSourceFromRegistry(registry?: string): SkillInstallSource {
  if (isJurismindRegistry(registry)) {
    return 'jurismindhub';
  }

  if (isClawHubRegistry(registry)) {
    return 'clawhub';
  }

  return 'unknown';
}

export function resolveSkillPageUrl(market: SkillMarket, slug: string): string {
  const siteUrl = market === 'jurismindhub' ? JURISMINDHUB_SITE_URL : CLAWHUB_SITE_URL;
  return `${siteUrl.replace(/\/+$/, '')}/s/${encodeURIComponent(slug)}`;
}
