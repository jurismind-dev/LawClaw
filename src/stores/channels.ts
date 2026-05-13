/**
 * Channels State Store
 * Manages messaging channel state
 */
import { create } from 'zustand';
import { CHANNEL_META, type Channel, type ChannelType } from '../types/channel';

interface AddChannelParams {
  type: ChannelType;
  name: string;
  token?: string;
}

interface ChannelsState {
  channels: Channel[];
  loading: boolean;
  error: string | null;

  // Actions
  fetchChannels: (options?: { probe?: boolean; quiet?: boolean }) => Promise<void>;
  addChannel: (params: AddChannelParams) => Promise<Channel>;
  deleteChannel: (channelId: string) => Promise<void>;
  connectChannel: (channelId: string) => Promise<void>;
  disconnectChannel: (channelId: string) => Promise<void>;
  requestQrCode: (channelType: ChannelType) => Promise<{ qrCode: string; sessionId: string }>;
  setChannels: (channels: Channel[]) => void;
  updateChannel: (channelId: string, updates: Partial<Channel>) => void;
  clearError: () => void;
}

function isSupportedChannelType(channelId: string): channelId is ChannelType {
  return Object.prototype.hasOwnProperty.call(CHANNEL_META, channelId);
}

const CHANNEL_STATUS_RPC_TIMEOUT_MS = 8_000;
const CHANNEL_STATUS_PROBE_RPC_TIMEOUT_MS = 5_000;

let _fetchChannelsInFlight: Promise<void> | null = null;
let _queuedFetchOptions: { probe?: boolean; quiet?: boolean } | null = null;

function mergeFetchOptions(
  current: { probe?: boolean; quiet?: boolean } | null,
  incoming: { probe?: boolean; quiet?: boolean } | undefined
): { probe?: boolean; quiet?: boolean } {
  return {
    probe: Boolean(current?.probe) || Boolean(incoming?.probe),
    quiet: (current?.quiet ?? true) && incoming?.quiet === true,
  };
}

export const useChannelsStore = create<ChannelsState>((set, get) => ({
  channels: [],
  loading: false,
  error: null,

  fetchChannels: async (options = {}) => {
    if (_fetchChannelsInFlight) {
      _queuedFetchOptions = mergeFetchOptions(_queuedFetchOptions, options);
      await _fetchChannelsInFlight;
      return;
    }

    const runFetch = async (fetchOptions: { probe?: boolean; quiet?: boolean }) => {
      const probe = fetchOptions.probe === true;
      const hasData = get().channels.length > 0;
      if (!fetchOptions.quiet && !hasData) {
        set({ loading: true, error: null });
      } else {
        set({ error: null });
      }

      try {
        const result = await window.electron.ipcRenderer.invoke(
          'gateway:rpc',
          'channels.status',
          { probe },
          probe ? CHANNEL_STATUS_PROBE_RPC_TIMEOUT_MS : CHANNEL_STATUS_RPC_TIMEOUT_MS
        ) as {
          success: boolean;
          result?: {
            channelOrder?: string[];
            channels?: Record<string, unknown>;
            channelAccounts?: Record<string, Array<{
              accountId?: string;
              configured?: boolean;
              connected?: boolean;
              running?: boolean;
              lastError?: string;
              name?: string;
              linked?: boolean;
              lastConnectedAt?: number | null;
              lastInboundAt?: number | null;
              lastOutboundAt?: number | null;
            }>>;
            channelDefaultAccountId?: Record<string, string>;
          };
          error?: string;
        };

        if (result.success && result.result) {
          const data = result.result;
          const channels: Channel[] = [];

          // Parse the complex channels.status response into simple Channel objects
          const channelOrder = data.channelOrder || Object.keys(data.channels || {});
          for (const channelId of channelOrder) {
            if (!isSupportedChannelType(channelId)) {
              continue;
            }

            const summary = (data.channels as Record<string, unknown> | undefined)?.[channelId] as Record<string, unknown> | undefined;
            const configured =
              typeof summary?.configured === 'boolean'
                ? summary.configured
                : typeof (summary as { running?: boolean })?.running === 'boolean'
                  ? true
                  : false;
            if (!configured) continue;

            const accounts = data.channelAccounts?.[channelId] || [];
            const defaultAccountId = data.channelDefaultAccountId?.[channelId];
            const primaryAccount =
              (defaultAccountId ? accounts.find((a) => a.accountId === defaultAccountId) : undefined) ||
              accounts.find((a) => a.connected === true || a.linked === true) ||
              accounts[0];

            // Map gateway status to our status format
            let status: Channel['status'] = 'disconnected';
            const now = Date.now();
            const RECENT_MS = 10 * 60 * 1000;
            const hasRecentActivity = (a: { lastInboundAt?: number | null; lastOutboundAt?: number | null; lastConnectedAt?: number | null }) =>
              (typeof a.lastInboundAt === 'number' && now - a.lastInboundAt < RECENT_MS) ||
              (typeof a.lastOutboundAt === 'number' && now - a.lastOutboundAt < RECENT_MS) ||
              (typeof a.lastConnectedAt === 'number' && now - a.lastConnectedAt < RECENT_MS);
            const anyConnected = accounts.some((a) => a.connected === true || a.linked === true || hasRecentActivity(a));
            const anyRunning = accounts.some((a) => a.running === true);
            const summaryError =
              typeof (summary as { error?: string })?.error === 'string'
                ? (summary as { error?: string }).error
                : typeof (summary as { lastError?: string })?.lastError === 'string'
                  ? (summary as { lastError?: string }).lastError
                  : undefined;
            const anyError =
              accounts.some((a) => typeof a.lastError === 'string' && a.lastError) || Boolean(summaryError);

            if (anyConnected) {
              status = 'connected';
            } else if (anyRunning && !anyError) {
              status = 'connected';
            } else if (anyError) {
              status = 'error';
            } else if (anyRunning) {
              status = 'connecting';
            }

            channels.push({
              id: `${channelId}-${primaryAccount?.accountId || 'default'}`,
              type: channelId,
              name: primaryAccount?.name || channelId,
              status,
              accountId: primaryAccount?.accountId,
              error:
                (typeof primaryAccount?.lastError === 'string' ? primaryAccount.lastError : undefined) ||
                (typeof summaryError === 'string' ? summaryError : undefined),
            });
          }

          set({ channels, loading: false, error: null });
        } else {
          // Preserve previous channel data during transient Gateway failures.
          set((state) => ({
            channels: state.channels,
            loading: false,
            error: result.error || null,
          }));
        }
      } catch (error) {
        // Preserve previous channel data during transient Gateway failures.
        set((state) => ({
          channels: state.channels,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    };

    _fetchChannelsInFlight = (async () => {
      await runFetch(options);
      while (_queuedFetchOptions) {
        const queued = _queuedFetchOptions;
        _queuedFetchOptions = null;
        await runFetch(queued);
      }
    })();

    try {
      await _fetchChannelsInFlight;
    } finally {
      _fetchChannelsInFlight = null;
    }
  },

  addChannel: async (params) => {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'gateway:rpc',
        'channels.add',
        params
      ) as { success: boolean; result?: Channel; error?: string };

      if (result.success && result.result) {
        set((state) => ({
          channels: [...state.channels, result.result!],
        }));
        return result.result;
      } else {
        // If gateway is not available, create a local channel for now
        const newChannel: Channel = {
          id: `local-${Date.now()}`,
          type: params.type,
          name: params.name,
          status: 'disconnected',
        };
        set((state) => ({
          channels: [...state.channels, newChannel],
        }));
        return newChannel;
      }
    } catch {
      // Create local channel if gateway unavailable
      const newChannel: Channel = {
        id: `local-${Date.now()}`,
        type: params.type,
        name: params.name,
        status: 'disconnected',
      };
      set((state) => ({
        channels: [...state.channels, newChannel],
      }));
      return newChannel;
    }
  },

  deleteChannel: async (channelId) => {
    const channel = get().channels.find((item) => item.id === channelId);
    const channelType = channel?.type || (channelId as ChannelType);
    const accountId = channel?.accountId;

    try {
      // Delete the channel configuration from openclaw.json
      await window.electron.ipcRenderer.invoke('channel:deleteConfig', channelType, accountId);
    } catch (error) {
      console.error('Failed to delete channel config:', error);
    }

    try {
      await window.electron.ipcRenderer.invoke(
        'gateway:rpc',
        'channels.logout',
        { channel: channelType, accountId }
      );
    } catch (error) {
      // Continue with local deletion even if gateway fails
      console.error('Failed to log out channel from gateway:', error);
    }

    // Remove from local state
    set((state) => ({
      channels: state.channels.filter((c) => c.id !== channelId),
    }));
  },

  connectChannel: async (channelId) => {
    const { updateChannel } = get();
    updateChannel(channelId, { status: 'connecting', error: undefined });

    try {
      const result = await window.electron.ipcRenderer.invoke(
        'gateway:rpc',
        'channels.connect',
        { channelId }
      ) as { success: boolean; error?: string };

      if (result.success) {
        updateChannel(channelId, { status: 'connected' });
      } else {
        updateChannel(channelId, { status: 'error', error: result.error });
      }
    } catch (error) {
      updateChannel(channelId, { status: 'error', error: String(error) });
    }
  },

  disconnectChannel: async (channelId) => {
    const { updateChannel } = get();

    try {
      await window.electron.ipcRenderer.invoke(
        'gateway:rpc',
        'channels.disconnect',
        { channelId }
      );
    } catch (error) {
      console.error('Failed to disconnect channel:', error);
    }

    updateChannel(channelId, { status: 'disconnected', error: undefined });
  },

  requestQrCode: async (channelType) => {
    const result = await window.electron.ipcRenderer.invoke(
      'gateway:rpc',
      'channels.requestQr',
      { type: channelType }
    ) as { success: boolean; result?: { qrCode: string; sessionId: string }; error?: string };

    if (result.success && result.result) {
      return result.result;
    }

    throw new Error(result.error || 'Failed to request QR code');
  },

  setChannels: (channels) => set({ channels }),

  updateChannel: (channelId, updates) => {
    set((state) => ({
      channels: state.channels.map((channel) =>
        channel.id === channelId ? { ...channel, ...updates } : channel
      ),
    }));
  },

  clearError: () => set({ error: null }),
}));
