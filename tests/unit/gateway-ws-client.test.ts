import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const wsState = vi.hoisted(() => ({
  sockets: [] as unknown[],
  MockWebSocket: class MockWebSocket {
    readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    readonly close = vi.fn((code = 1000, reason = '') => {
      queueMicrotask(() => {
        this.emit('close', code, Buffer.from(String(reason)));
      });
    });
    readonly terminate = vi.fn();

    constructor(public readonly url: string) {
      wsState.sockets.push(this);
    }

    on(event: string, callback: (...args: unknown[]) => void): this {
      const current = this.listeners.get(event) ?? new Set();
      current.add(callback);
      this.listeners.set(event, current);
      return this;
    }

    emit(event: string, ...args: unknown[]): void {
      for (const callback of this.listeners.get(event) ?? []) {
        callback(...args);
      }
    }

    emitOpen(): void {
      this.emit('open');
    }

    emitJsonMessage(message: unknown): void {
      this.emit('message', Buffer.from(JSON.stringify(message)));
    }
  },
}));

type MockWebSocket = InstanceType<typeof wsState.MockWebSocket>;

vi.mock('ws', () => ({
  default: wsState.MockWebSocket,
}));

vi.mock('@electron/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { probeGatewayReady } from '@electron/gateway/ws-client';

function getLatestSocket(): MockWebSocket {
  const socket = wsState.sockets[wsState.sockets.length - 1];
  if (!socket) throw new Error('Expected a mocked WebSocket instance');
  return socket as MockWebSocket;
}

describe('probeGatewayReady', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    wsState.sockets.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    wsState.sockets.length = 0;
  });

  it('resolves true when connect.challenge message is received', async () => {
    const probePromise = probeGatewayReady(18789, 5000);
    const socket = getLatestSocket();

    socket.emitOpen();
    socket.emitJsonMessage({
      type: 'event',
      event: 'connect.challenge',
      payload: { nonce: 'probe-nonce' },
    });

    await expect(probePromise).resolves.toBe(true);
    expect(socket.terminate).toHaveBeenCalled();
  });

  it('does not resolve true on plain open event', async () => {
    const probePromise = probeGatewayReady(18789, 500);
    const socket = getLatestSocket();

    socket.emitOpen();
    await vi.advanceTimersByTimeAsync(501);

    await expect(probePromise).resolves.toBe(false);
    expect(socket.terminate).toHaveBeenCalled();
  });

  it('resolves false when socket closes before challenge', async () => {
    const probePromise = probeGatewayReady(18789, 5000);
    const socket = getLatestSocket();

    socket.emitOpen();
    socket.emit('close', 1006, Buffer.from(''));

    await expect(probePromise).resolves.toBe(false);
    expect(socket.terminate).toHaveBeenCalled();
  });
});
