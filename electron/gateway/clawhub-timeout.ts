export function isClawHubTimeoutFailure(errorText?: string): boolean {
  if (!errorText) {
    return false;
  }

  const normalized = errorText.toLowerCase();
  return normalized.includes('timeout');
}
