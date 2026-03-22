import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf-8');
}

describe('weixin channel integration', () => {
  it('wires the dedicated Weixin onboarding panel into channel setup flows', () => {
    const channelsSource = readSource('src/pages/Channels/index.tsx');
    const setupSource = readSource('src/pages/Setup/index.tsx');

    expect(channelsSource).toContain("selectedType === 'openclaw-weixin'");
    expect(channelsSource).toContain('<WeixinOnboardingPanel');
    expect(setupSource).toContain("selectedChannel === 'openclaw-weixin'");
    expect(setupSource).toContain('<WeixinOnboardingPanel');
  });

  it('deletes channels by their real type and account id instead of splitting hyphenated ids', () => {
    const storeSource = readSource('src/stores/channels.ts');

    expect(storeSource).not.toContain("channelId.split('-')[0]");
    expect(storeSource).toContain("item.id === channelId");
    expect(storeSource).toContain("'channels.logout'");
    expect(storeSource).toContain("'channel:deleteConfig', channelType, accountId");
  });

  it('removes qqbot from the frontend channel metadata and channel page entrypoints', () => {
    const channelTypesSource = readSource('src/types/channel.ts');
    const channelsPageSource = readSource('src/pages/Channels/index.tsx');
    const storeSource = readSource('src/stores/channels.ts');
    const packageJsonSource = readSource('package.json');
    const ipcHandlersSource = readSource('electron/main/ipc-handlers.ts');

    expect(channelTypesSource).not.toContain("| 'qqbot'");
    expect(channelTypesSource).not.toContain('qqbot: {');
    expect(channelsPageSource).not.toContain("'qqbot'");
    expect(channelsPageSource).not.toContain('isQqPluginInstalled');
    expect(storeSource).not.toContain("'qqbot'");
    expect(storeSource).toContain('isSupportedChannelType');
    expect(packageJsonSource).not.toContain('bundle-qq-plugin.mjs');
    expect(ipcHandlersSource).not.toContain('qqbot');
  });
});
