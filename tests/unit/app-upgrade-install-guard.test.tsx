import { describe, expect, it } from 'vitest';
import { resolvePresetInstallRedirectPath } from '@/lib/preset-install-guard';

describe('resolvePresetInstallRedirectPath', () => {
  it('setup 未完成时不触发升级阻塞重定向', () => {
    const result = resolvePresetInstallRedirectPath({
      setupComplete: false,
      pathname: '/',
      pending: true,
    });
    expect(result).toBeNull();
  });

  it('setup 完成且 pending 时重定向到升级安装页', () => {
    const result = resolvePresetInstallRedirectPath({
      setupComplete: true,
      pathname: '/chat',
      pending: true,
    });
    expect(result).toBe('/upgrade-installing');
  });

  it('已经在升级安装页时保持当前路由', () => {
    const result = resolvePresetInstallRedirectPath({
      setupComplete: true,
      pathname: '/upgrade-installing',
      pending: true,
    });
    expect(result).toBeNull();
  });

  it('升级安装完成后会从升级页返回首页', () => {
    const result = resolvePresetInstallRedirectPath({
      setupComplete: true,
      pathname: '/upgrade-installing',
      pending: false,
    });
    expect(result).toBe('/');
  });
});
