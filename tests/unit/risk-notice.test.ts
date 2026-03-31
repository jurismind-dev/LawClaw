import { describe, expect, it } from 'vitest';
import {
  hasAcceptedRiskNotice,
  RISK_NOTICE_VERSION,
  isRiskNoticePlatform,
  shouldShowRiskNotice,
} from '@/lib/risk-notice';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('risk notice', () => {
  it('only targets macOS and Windows', () => {
    expect(isRiskNoticePlatform('darwin')).toBe(true);
    expect(isRiskNoticePlatform('win32')).toBe(true);
    expect(isRiskNoticePlatform('linux')).toBe(false);
  });

  it('treats any persisted acceptance marker as accepted across app updates', () => {
    expect(hasAcceptedRiskNotice('')).toBe(false);
    expect(hasAcceptedRiskNotice('   ')).toBe(false);
    expect(hasAcceptedRiskNotice('v0.9')).toBe(true);
    expect(hasAcceptedRiskNotice(RISK_NOTICE_VERSION)).toBe(true);
  });

  it('shows only when the notice has never been accepted', () => {
    expect(shouldShowRiskNotice('win32', null)).toBe(true);
    expect(shouldShowRiskNotice('darwin', undefined)).toBe(true);
    expect(shouldShowRiskNotice('win32', '')).toBe(true);
    expect(shouldShowRiskNotice('linux', null)).toBe(false);
    expect(shouldShowRiskNotice('win32', 'v0.9')).toBe(false);
    expect(shouldShowRiskNotice('darwin', RISK_NOTICE_VERSION)).toBe(false);
  });

  it('persists acceptance via settings IPC instead of renderer localStorage', () => {
    const source = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf-8');

    expect(source).toContain("window.electron.ipcRenderer.invoke(\n          'settings:get'");
    expect(source).toContain("window.electron.ipcRenderer\n      .invoke('settings:set', 'riskNoticeAcceptedVersion', RISK_NOTICE_VERSION)");
  });
});
