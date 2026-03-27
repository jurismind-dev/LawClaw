import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readBindingConfigSource(): string {
  return readFileSync(
    join(process.cwd(), 'electron/utils/jurismind-provider-binding-config.ts'),
    'utf-8'
  );
}

function readBundledBindingConfig(): {
  profiles?: Record<string, { ssoLoginUrl?: string; ssoApiBaseUrl?: string }>;
} {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'resources/config/jurismind-provider.json'), 'utf-8')
  ) as {
    profiles?: Record<string, { ssoLoginUrl?: string; ssoApiBaseUrl?: string }>;
  };
}

describe('jurismind provider binding config', () => {
  it('uses the sso-v2 login host with the api-v2 production checkTicket host', () => {
    const source = readBindingConfigSource();
    const bundledConfig = readBundledBindingConfig();

    expect(source).toContain("ssoLoginUrl: 'https://sso-v2.jurismind.com'");
    expect(source).toContain("ssoApiBaseUrl: 'https://api-v2.jurismind.com'");
    expect(bundledConfig.profiles?.production).toEqual({
      ssoLoginUrl: 'https://sso-v2.jurismind.com',
      ssoApiBaseUrl: 'https://api-v2.jurismind.com',
    });
  });
});
