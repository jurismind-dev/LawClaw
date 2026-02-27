import { describe, expect, it } from 'vitest';
import { isClawHubTimeoutFailure } from '@electron/gateway/clawhub-timeout';

describe('clawhub timeout detection', () => {
  it('detects known timeout error signatures', () => {
    expect(
      isClawHubTimeoutFailure(
        'Non-error was thrown: "Timeout". You should only throw errors.'
      )
    ).toBe(true);
    expect(isClawHubTimeoutFailure('Error: request timeout after 30000ms')).toBe(true);
  });

  it('ignores non-timeout errors', () => {
    expect(isClawHubTimeoutFailure('Error: unauthorized')).toBe(false);
    expect(isClawHubTimeoutFailure('')).toBe(false);
    expect(isClawHubTimeoutFailure(undefined)).toBe(false);
  });
});
