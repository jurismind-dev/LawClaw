import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import i18n from '@/i18n';
import { SetupLegalNoticeModal } from '@/components/common/SetupLegalNoticeModal';
import {
  SETUP_LEGAL_NOTICE_PRIVACY_POLICY_URL,
  SETUP_LEGAL_NOTICE_SERVICE_AGREEMENT_URL,
  SETUP_LEGAL_NOTICE_VERSION,
  hasAcceptedSetupLegalNotice,
  shouldShowSetupLegalNotice,
} from '@/lib/setup-legal-notice';

describe('setup legal notice', () => {
  beforeEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('zh');
    });
  });

  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('shows only before setup is complete and until accepted', () => {
    expect(hasAcceptedSetupLegalNotice('')).toBe(false);
    expect(hasAcceptedSetupLegalNotice('  ')).toBe(false);
    expect(hasAcceptedSetupLegalNotice(SETUP_LEGAL_NOTICE_VERSION)).toBe(true);

    expect(shouldShowSetupLegalNotice(false, null)).toBe(true);
    expect(shouldShowSetupLegalNotice(false, '')).toBe(true);
    expect(shouldShowSetupLegalNotice(false, SETUP_LEGAL_NOTICE_VERSION)).toBe(false);
    expect(shouldShowSetupLegalNotice(true, null)).toBe(false);
  });

  it('opens the agreement links in the external browser', () => {
    render(<SetupLegalNoticeModal onAccept={() => {}} onReject={() => {}} />);

    fireEvent.click(screen.getByRole('link', { name: /用户协议/i }));
    expect(window.electron.openExternal).toHaveBeenCalledWith(SETUP_LEGAL_NOTICE_SERVICE_AGREEMENT_URL);

    fireEvent.click(screen.getByRole('link', { name: /隐私政策/i }));
    expect(window.electron.openExternal).toHaveBeenCalledWith(SETUP_LEGAL_NOTICE_PRIVACY_POLICY_URL);
  });

  it('renders the compact inline-link copy', () => {
    render(<SetupLegalNoticeModal onAccept={() => {}} onReject={() => {}} />);

    expect(screen.getByText('欢迎使用劳有钳LawClaw！')).toBeInTheDocument();
    expect(
      screen.getByText((_, element) =>
        element?.tagName.toLowerCase() === 'p'
        && element.textContent === '在使用前，请您仔细阅读《用户协议》和《隐私政策》，并进行确认。'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '《用户协议》' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '《隐私政策》' })).toBeInTheDocument();
  });

  it('wires the setup legal notice ahead of the risk notice in App', () => {
    const source = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf-8');

    expect(source).toContain("import { SetupLegalNoticeModal } from '@/components/common/SetupLegalNoticeModal';");
    expect(source).toContain("SETUP_LEGAL_NOTICE_SETTING_KEY");
    expect(source).toContain(".invoke('settings:set', SETUP_LEGAL_NOTICE_SETTING_KEY, SETUP_LEGAL_NOTICE_VERSION)");
    expect(source.indexOf('<SetupLegalNoticeModal')).toBeLessThan(source.indexOf('<RiskNoticeModal'));
  });

  it('fires accept and reject callbacks', () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();

    render(<SetupLegalNoticeModal onAccept={onAccept} onReject={onReject} />);

    fireEvent.click(screen.getByRole('button', { name: '我已阅读并同意' }));
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }));

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });
});
