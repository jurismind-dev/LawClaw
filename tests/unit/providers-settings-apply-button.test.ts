import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('providers settings apply button', () => {
  it('uses a text apply button instead of a star icon for the default-provider action', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/settings/ProvidersSettings.tsx'),
      'utf-8'
    );

    expect(source).toContain("variant={isDefault ? 'secondary' : 'outline'}");
    expect(source).toContain("title={isDefault ? t('aiProviders.card.applied') : t('aiProviders.card.apply')}");
    expect(source).toContain("{isDefault ? t('aiProviders.card.applied') : t('aiProviders.card.apply')}");
    expect(source).not.toContain('<Star');
  });
});
