import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
    getVersion: vi.fn(() => '0.0.0-test'),
    isPackaged: false,
  },
}));

describe('whatsapp login optional runtime loading', () => {
  it('does not throw during import when optional WhatsApp deps are absent', async () => {
    vi.resetModules();

    await expect(import('@electron/utils/whatsapp-login')).resolves.toMatchObject({
      whatsAppLoginManager: expect.any(Object),
    });
  });

  it('emits a direct error instead of crashing startup when WhatsApp runtime deps are unavailable', async () => {
    vi.resetModules();
    const mod = await import('@electron/utils/whatsapp-login');

    const errorEvent = once(mod.whatsAppLoginManager, 'error');
    await mod.whatsAppLoginManager.start('test-account');
    const [message] = await errorEvent;

    expect(String(message)).toContain('optional runtime dependencies');
    expect(String(message)).toContain('@whiskeysockets/baileys');
  });
});
