import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readProvidersSettingsSource(): string {
  return readFileSync(join(process.cwd(), 'src/components/settings/ProvidersSettings.tsx'), 'utf-8');
}

describe('providers settings jurismind activation', () => {
  it('auto-selects Jurismind after binding or editing in settings', () => {
    const source = readProvidersSettingsSource();

    expect(source).toContain("if (type === 'jurismind' || shouldAutoSelectLawClawProvider('settings'))");
    expect(source).toContain("if (provider.type === 'jurismind') {");
    expect(source).toContain('await setDefaultProvider(provider.id);');
  });
});
