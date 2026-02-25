import { describe, expect, it } from 'vitest';
import {
  isGatewayTokenMismatchError,
  parseWindowsListeningPidsByPort,
} from '@electron/gateway/process-discovery';

describe('gateway process discovery utilities', () => {
  it('识别 token mismatch 错误', () => {
    const error = new Error('unauthorized: gateway token mismatch (provide gateway auth token)');
    expect(isGatewayTokenMismatchError(error)).toBe(true);
  });

  it('从 netstat 输出中解析监听端口 PID', () => {
    const sample = [
      '  TCP    0.0.0.0:18789         0.0.0.0:0              LISTENING       1234',
      '  TCP    [::]:18789            [::]:0                 LISTENING       5678',
      '  TCP    127.0.0.1:3000        0.0.0.0:0              LISTENING       1111',
    ].join('\n');

    expect(parseWindowsListeningPidsByPort(sample, 18789)).toEqual([1234, 5678]);
  });
});
