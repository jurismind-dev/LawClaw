import { describe, expect, it } from 'vitest';
import { extractJsonCandidate, parseJsonFromMixedOutput } from '../../connector-runtime/json-output.js';

describe('jurismind connector mixed CLI JSON output parsing', () => {
  it('extracts the JSON payload when plugin warnings precede stdout JSON', () => {
    const raw = [
      '[plugins] openclaw-weixin failed to load from C:\\\\Users\\\\demo\\\\.openclaw\\\\extensions\\\\openclaw-weixin\\\\index.ts: TypeError: test',
      '[plugins] 1 plugin(s) failed to initialize (load: openclaw-weixin).',
      '{"pending":[{"requestId":"req_123","deviceId":"device_1","role":"operator","ts":123}]}',
    ].join('\n');

    expect(extractJsonCandidate(raw)).toBe(
      '{"pending":[{"requestId":"req_123","deviceId":"device_1","role":"operator","ts":123}]}'
    );
    expect(parseJsonFromMixedOutput(raw, {})).toEqual({
      pending: [
        {
          requestId: 'req_123',
          deviceId: 'device_1',
          role: 'operator',
          ts: 123,
        },
      ],
    });
  });

  it('ignores bracketed log prefixes before a JSON array payload', () => {
    const raw = [
      '[warn] noisy prefix',
      '[{"requestId":"req_456"}]',
    ].join('\n');

    expect(parseJsonFromMixedOutput(raw, [])).toEqual([{ requestId: 'req_456' }]);
  });

  it('returns the provided fallback when no JSON payload is present', () => {
    expect(parseJsonFromMixedOutput('[warn] nothing to parse', { pending: [] })).toEqual({
      pending: [],
    });
  });
});
