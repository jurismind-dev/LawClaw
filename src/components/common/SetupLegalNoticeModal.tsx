import { useEffect, useId } from 'react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  SETUP_LEGAL_NOTICE_PRIVACY_POLICY_URL,
  SETUP_LEGAL_NOTICE_SERVICE_AGREEMENT_URL,
} from '@/lib/setup-legal-notice';

interface SetupLegalNoticeModalProps {
  onAccept: () => void;
  onReject: () => void;
}

function LegalLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    void window.electron.openExternal(href);
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className="font-medium text-[#3b82f6] underline underline-offset-2 transition-colors hover:text-[#2563eb]"
    >
      {label}
    </a>
  );
}

export function SetupLegalNoticeModal({ onAccept, onReject }: SetupLegalNoticeModalProps) {
  const { t } = useTranslation('setup');
  const titleId = useId();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100000] bg-black/40 backdrop-blur-[3px]">
      <div className="flex min-h-full items-center justify-center px-4 py-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="w-full max-w-[560px] overflow-hidden rounded-[24px] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.18)]"
        >
          <div className="px-8 pb-8 pt-7">
            <h1
              id={titleId}
              className="text-center text-[21px] font-semibold leading-8 tracking-tight text-[#111827]"
            >
              {t('legalNotice.title')}
            </h1>
            <p className="mx-auto mt-7 max-w-[420px] text-center text-[15px] leading-7 text-[#6b7280]">
              {t('legalNotice.prefix')}
              <LegalLink
                href={SETUP_LEGAL_NOTICE_SERVICE_AGREEMENT_URL}
                label={t('legalNotice.serviceAgreement')}
              />
              {t('legalNotice.connector')}
              <LegalLink
                href={SETUP_LEGAL_NOTICE_PRIVACY_POLICY_URL}
                label={t('legalNotice.privacyPolicy')}
              />
              {t('legalNotice.suffix')}
            </p>

            <div className="mt-9 grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={onReject}
                className="h-12 rounded-2xl text-[17px] font-medium"
              >
                {t('legalNotice.reject')}
              </Button>
              <Button
                onClick={onAccept}
                className="h-12 rounded-2xl text-[17px] font-medium"
              >
                {t('legalNotice.accept')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
