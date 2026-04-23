/**
 * Gateway State Store
 * Manages Gateway connection state and communication
 */
import { create } from 'zustand';
import type { GatewayStatus } from '../types/gateway';

let gatewayInitPromise: Promise<void> | null = null;
const gatewayEventDedupe = new Map<string, number>();
const GATEWAY_EVENT_DEDUPE_TTL_MS = 30_000;
const GATEWAY_LISTENER_CLEANUP_KEY = '__lawclawGatewayListenerCleanups';

type GatewayListenerCleanup = () => void;

type GatewayGlobal = typeof globalThis & {
  [GATEWAY_LISTENER_CLEANUP_KEY]?: GatewayListenerCleanup[];
};

interface GatewayHealth {
  ok: boolean;
  error?: string;
  uptime?: number;
}

interface GatewayState {
  status: GatewayStatus;
  health: GatewayHealth | null;
  isInitialized: boolean;
  lastError: string | null;

  // Actions
  init: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  checkHealth: () => Promise<GatewayHealth>;
  rpc: <T>(method: string, params?: unknown, timeoutMs?: number) => Promise<T>;
  setStatus: (status: GatewayStatus) => void;
  clearError: () => void;
}

function pruneGatewayEventDedupe(now: number): void {
  for (const [key, timestamp] of gatewayEventDedupe.entries()) {
    if (now - timestamp > GATEWAY_EVENT_DEDUPE_TTL_MS) {
      gatewayEventDedupe.delete(key);
    }
  }
}

function serializeGatewayEventValue(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

function buildGatewayEventDedupeKey(event: Record<string, unknown>): string | null {
  const runId = event.runId != null ? String(event.runId) : '';
  const seq = event.seq != null ? String(event.seq) : '';
  const state = event.state != null ? String(event.state) : '';
  const phase = event.phase != null ? String(event.phase) : '';
  const message = event.message;

  if (seq) {
    return ['seq', runId, seq, state].join('|');
  }

  if (message && typeof message === 'object') {
    const msg = message as Record<string, unknown>;
    const messageId = msg.id != null ? String(msg.id) : '';
    if (messageId) {
      return ['message-id', runId, state, messageId].join('|');
    }

    const serializedMessage = serializeGatewayEventValue(message);
    if (serializedMessage) {
      return ['message', runId, state, serializedMessage].join('|');
    }
  }

  if (runId || phase || state) {
    return ['event', runId, phase, state].join('|');
  }

  return null;
}

function getMessageIdDedupeKey(event: Record<string, unknown>): string | null {
  const state = event.state != null ? String(event.state) : '';
  if (state !== 'final') return null;

  const message = event.message;
  if (message && typeof message === 'object') {
    const messageId = (message as Record<string, unknown>).id;
    if (messageId != null) {
      return `final-msgid|${String(messageId)}`;
    }
  }

  return null;
}

function shouldProcessGatewayEvent(event: Record<string, unknown>): boolean {
  const key = buildGatewayEventDedupeKey(event);
  const messageKey = getMessageIdDedupeKey(event);
  if (!key && !messageKey) return true;

  const now = Date.now();
  pruneGatewayEventDedupe(now);

  if ((key && gatewayEventDedupe.has(key)) || (messageKey && gatewayEventDedupe.has(messageKey))) {
    return false;
  }

  if (key) gatewayEventDedupe.set(key, now);
  if (messageKey) gatewayEventDedupe.set(messageKey, now);
  return true;
}

function clearGatewayRendererListeners(): void {
  const global = globalThis as GatewayGlobal;
  const cleanups = global[GATEWAY_LISTENER_CLEANUP_KEY] ?? [];
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch {
      // ignore stale listener cleanup failures
    }
  }
  global[GATEWAY_LISTENER_CLEANUP_KEY] = [];
}

function registerGatewayRendererListener(
  channel: string,
  callback: (...args: unknown[]) => void,
): void {
  const unsubscribe = window.electron.ipcRenderer.on(channel, callback);
  if (typeof unsubscribe !== 'function') {
    return;
  }

  const global = globalThis as GatewayGlobal;
  const cleanups = global[GATEWAY_LISTENER_CLEANUP_KEY] ?? [];
  cleanups.push(unsubscribe);
  global[GATEWAY_LISTENER_CLEANUP_KEY] = cleanups;
}

export const useGatewayStore = create<GatewayState>((set, get) => ({
  status: {
    state: 'stopped',
    port: 18789,
  },
  health: null,
  isInitialized: false,
  lastError: null,

  init: async () => {
    if (get().isInitialized) return;
    if (gatewayInitPromise) {
      await gatewayInitPromise;
      return;
    }

    gatewayInitPromise = (async () => {
      try {
        // Get initial status first
        const status = await window.electron.ipcRenderer.invoke('gateway:status') as GatewayStatus;
        set({ status, isInitialized: true });
        clearGatewayRendererListeners();

        // Listen for status changes
        registerGatewayRendererListener('gateway:status-changed', (newStatus) => {
          set({ status: newStatus as GatewayStatus });
        });

        // Listen for errors
        registerGatewayRendererListener('gateway:error', (error) => {
          set({ lastError: String(error) });
        });

        // Some Gateway builds stream chat events via generic "agent" notifications.
        // Normalize and forward them to the chat store.
        // The Gateway may put event fields (state, message, etc.) either inside
        // params.data or directly on params — we must handle both layouts.
        registerGatewayRendererListener('gateway:notification', (notification) => {
          const payload = notification as { method?: string; params?: Record<string, unknown> } | undefined;
          if (!payload || payload.method !== 'agent' || !payload.params || typeof payload.params !== 'object') {
            return;
          }

          const p = payload.params;
          const data = (p.data && typeof p.data === 'object') ? (p.data as Record<string, unknown>) : {};
          const phase = data.phase ?? p.phase;

          const hasChatData = (p.state ?? data.state) || (p.message ?? data.message);
          if (hasChatData) {
            const normalizedEvent: Record<string, unknown> = {
              ...data,
              runId: p.runId ?? data.runId,
              sessionKey: p.sessionKey ?? data.sessionKey,
              stream: p.stream ?? data.stream,
              seq: p.seq ?? data.seq,
              state: p.state ?? data.state,
              message: p.message ?? data.message,
            };
            if (!shouldProcessGatewayEvent(normalizedEvent)) {
              return;
            }
            import('./chat')
              .then(({ useChatStore }) => {
                useChatStore.getState().handleChatEvent(normalizedEvent);
              })
              .catch(() => {});
          }

          // When a run starts (e.g. user clicked Send on console), show loading in the app immediately.
          const runId = p.runId ?? data.runId;
          const sessionKey = p.sessionKey ?? data.sessionKey;
          if (phase === 'started' && runId != null && sessionKey != null) {
            import('./chat')
              .then(({ useChatStore }) => {
                const state = useChatStore.getState();
                const resolvedSessionKey = String(sessionKey);
                const shouldRefreshSessions =
                  resolvedSessionKey !== state.currentSessionKey
                  || !state.sessions.some((session) => session.key === resolvedSessionKey);
                if (shouldRefreshSessions) {
                  void state.loadSessions(true);
                }

                state.handleChatEvent({
                  state: 'started',
                  runId,
                  sessionKey: resolvedSessionKey,
                });
              })
              .catch(() => {});
          }

          // When the agent run completes, reload history to get the final response.
          if (phase === 'completed' || phase === 'done' || phase === 'finished' || phase === 'end') {
            import('./chat')
              .then(({ useChatStore }) => {
                const state = useChatStore.getState();
                const resolvedSessionKey = sessionKey != null ? String(sessionKey) : null;
                const shouldRefreshSessions = resolvedSessionKey != null && (
                  resolvedSessionKey !== state.currentSessionKey
                  || !state.sessions.some((session) => session.key === resolvedSessionKey)
                );
                if (shouldRefreshSessions) {
                  void state.loadSessions(true);
                }

                const matchesCurrentSession =
                  resolvedSessionKey == null || resolvedSessionKey === state.currentSessionKey;
                const matchesActiveRun =
                  runId != null && state.activeRunId != null && String(runId) === state.activeRunId;

                if (matchesCurrentSession || matchesActiveRun) {
                  // Let chat store/history recovery own the final transition so
                  // the UI keeps the stop state until authoritative final data lands.
                  void state.loadHistory(true);
                }

                if ((matchesCurrentSession || matchesActiveRun) && state.sending) {
                  useChatStore.setState({
                    sending: false,
                    activeRunId: null,
                    pendingFinal: false,
                    lastUserMessageAt: null,
                    error: null,
                  });
                }
              })
              .catch(() => {});
          }
        });

        // Listen for chat events from the gateway and forward to chat store.
        // The data arrives as { message: payload } from handleProtocolEvent.
        // The payload may be a full event wrapper ({ state, runId, message })
        // or the raw chat message itself. We need to handle both.
        registerGatewayRendererListener('gateway:chat-message', (data) => {
          try {
            import('./chat').then(({ useChatStore }) => {
              const chatData = data as Record<string, unknown>;
              const payload = ('message' in chatData && typeof chatData.message === 'object')
                ? chatData.message as Record<string, unknown>
                : chatData;

              if (payload.state) {
                if (!shouldProcessGatewayEvent(payload)) {
                  return;
                }
                useChatStore.getState().handleChatEvent(payload);
                return;
              }

              // Raw message without state wrapper — treat as final
              const normalizedEvent = {
                state: 'final',
                message: payload,
                runId: chatData.runId ?? payload.runId,
              };
              if (!shouldProcessGatewayEvent(normalizedEvent)) {
                return;
              }
              useChatStore.getState().handleChatEvent(normalizedEvent);
            }).catch(() => {});
          } catch {
            // Silently ignore forwarding failures
          }
        });

      } catch (error) {
        console.error('Failed to initialize Gateway:', error);
        set({ lastError: String(error) });
      } finally {
        gatewayInitPromise = null;
      }
    })();

    await gatewayInitPromise;
  },

  start: async () => {
    try {
      set({ status: { ...get().status, state: 'starting' }, lastError: null });
      const result = await window.electron.ipcRenderer.invoke('gateway:start') as { success: boolean; error?: string };

      if (!result.success) {
        set({
          status: { ...get().status, state: 'error', error: result.error },
          lastError: result.error || 'Failed to start Gateway'
        });
      }
    } catch (error) {
      set({
        status: { ...get().status, state: 'error', error: String(error) },
        lastError: String(error)
      });
    }
  },

  stop: async () => {
    try {
      await window.electron.ipcRenderer.invoke('gateway:stop');
      set({ status: { ...get().status, state: 'stopped' }, lastError: null });
    } catch (error) {
      console.error('Failed to stop Gateway:', error);
      set({ lastError: String(error) });
    }
  },

  restart: async () => {
    try {
      set({ status: { ...get().status, state: 'starting' }, lastError: null });
      const result = await window.electron.ipcRenderer.invoke('gateway:restart') as { success: boolean; error?: string };

      if (!result.success) {
        set({
          status: { ...get().status, state: 'error', error: result.error },
          lastError: result.error || 'Failed to restart Gateway'
        });
      }
    } catch (error) {
      set({
        status: { ...get().status, state: 'error', error: String(error) },
        lastError: String(error)
      });
    }
  },

  checkHealth: async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('gateway:health') as {
        success: boolean;
        ok: boolean;
        error?: string;
        uptime?: number
      };

      const health: GatewayHealth = {
        ok: result.ok,
        error: result.error,
        uptime: result.uptime,
      };

      set({ health });
      return health;
    } catch (error) {
      const health: GatewayHealth = { ok: false, error: String(error) };
      set({ health });
      return health;
    }
  },

  rpc: async <T>(method: string, params?: unknown, timeoutMs?: number): Promise<T> => {
    const result = await window.electron.ipcRenderer.invoke('gateway:rpc', method, params, timeoutMs) as {
      success: boolean;
      result?: T;
      error?: string;
    };

    if (!result.success) {
      throw new Error(result.error || `RPC call failed: ${method}`);
    }

    return result.result as T;
  },

  setStatus: (status) => set({ status }),

  clearError: () => set({ lastError: null }),
}));
