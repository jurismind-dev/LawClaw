export const SETUP_LEGAL_NOTICE_VERSION = 'v1.0-20260331';
export const SETUP_LEGAL_NOTICE_SETTING_KEY = 'setupLegalNoticeAcceptedVersion';

export const SETUP_LEGAL_NOTICE_PRIVACY_POLICY_URL =
  'https://jurismind-files.oss-cn-shanghai.aliyuncs.com/PrivacyPolicy.pdf';
export const SETUP_LEGAL_NOTICE_SERVICE_AGREEMENT_URL =
  'https://jurismind-files.oss-cn-shanghai.aliyuncs.com/ServiceAgreement.pdf';

export function hasAcceptedSetupLegalNotice(acceptedVersion: string | null | undefined): boolean {
  return typeof acceptedVersion === 'string' && acceptedVersion.trim().length > 0;
}

export function shouldShowSetupLegalNotice(
  setupComplete: boolean,
  acceptedVersion: string | null | undefined,
): boolean {
  return !setupComplete && !hasAcceptedSetupLegalNotice(acceptedVersion);
}
