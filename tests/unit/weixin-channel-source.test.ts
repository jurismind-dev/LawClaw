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

  it('pins the Weixin plugin to the npm-official host-compatible version', () => {
    const stateSource = readSource('electron/utils/weixin-channel-state.ts');
    const onboardingSource = readSource('electron/utils/weixin-onboarding.ts');
    const pluginInstallSource = readSource('electron/utils/openclaw-plugin-install.ts');

    expect(stateSource).toContain("export const WEIXIN_PLUGIN_VERSION = '2.1.7'");
    expect(stateSource).toContain('`@tencent-weixin/openclaw-weixin@${WEIXIN_PLUGIN_VERSION}`');
    expect(onboardingSource).toContain('installedVersion === WEIXIN_PLUGIN_VERSION');
    expect(onboardingSource).toContain('removeExistingPluginInstallDir');
    expect(pluginInstallSource).toContain('removeInstalledPluginDir');
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

  it('removes dingtalk from channel metadata, translations, and bundled dependencies', () => {
    const channelTypesSource = readSource('src/types/channel.ts');
    const zhChannelsSource = readSource('src/i18n/locales/zh/channels.json');
    const channelConfigSource = readSource('electron/utils/channel-config.ts');
    const gatewayClientSource = readSource('electron/gateway/client.ts');
    const packageJsonSource = readSource('package.json');

    expect(channelTypesSource).not.toContain("| 'dingtalk'");
    expect(channelTypesSource).not.toContain("id: 'dingtalk'");
    expect(zhChannelsSource).not.toContain('"dingtalk"');
    expect(channelConfigSource).not.toContain("channelType === 'dingtalk'");
    expect(gatewayClientSource).not.toContain("'dingtalk'");
    expect(packageJsonSource).not.toContain('@soimy/dingtalk');
  });
});
