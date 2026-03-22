import { useCallback, useEffect, useRef, useState } from 'react';

type WeixinOnboardingPhase =
  | 'idle'
  | 'installing'
  | 'waiting_scan'
  | 'polling'
  | 'configured'
  | 'error';

interface WeixinOnboardingStatus {
  phase?: WeixinOnboardingPhase;
  pluginInstalled?: boolean;
  configured?: boolean;
  pairUrl?: string | null;
  pairQrCode?: string | null;
  accountId?: string | null;
  lastError?: string | null;
  lastMessage?: string | null;
}

interface WeixinOnboardingResult {
  pairUrl?: string;
  pairQrCode?: string | null;
}

interface StartOptions {
  forceRefresh?: boolean;
}

interface UseWeixinOnboardingOptions {
  autoStart?: boolean;
  onConnected?: () => void;
}

export function useWeixinOnboarding(options: UseWeixinOnboardingOptions = {}) {
  const autoStartedRef = useRef(false);
  const onConnectedRef = useRef(options.onConnected);
  const startRequestInFlightRef = useRef(false);
  const clearRequestInFlightRef = useRef(false);

  const [phase, setPhase] = useState<WeixinOnboardingPhase>('idle');
  const [configured, setConfigured] = useState(false);
  const [pluginInstalled, setPluginInstalled] = useState(false);
  const [pairUrl, setPairUrl] = useState('');
  const [pairQrCode, setPairQrCode] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    onConnectedRef.current = options.onConnected;
  }, [options.onConnected]);

  const applyStatus = useCallback((status: unknown) => {
    const data = status as WeixinOnboardingStatus | null;
    if (!data || typeof data !== 'object') {
      return;
    }

    if (typeof data.phase === 'string') {
      setPhase(data.phase);
      setLoading(data.phase === 'installing' || data.phase === 'polling');
    }
    if (typeof data.configured === 'boolean') {
      setConfigured(data.configured);
    }
    if (typeof data.pluginInstalled === 'boolean') {
      setPluginInstalled(data.pluginInstalled);
    }
    if ('pairUrl' in data) {
      setPairUrl(typeof data.pairUrl === 'string' ? data.pairUrl : '');
    }
    if ('pairQrCode' in data) {
      setPairQrCode(typeof data.pairQrCode === 'string' ? data.pairQrCode : null);
    }
    if ('accountId' in data) {
      setAccountId(typeof data.accountId === 'string' && data.accountId ? data.accountId : null);
    }
    if ('lastMessage' in data) {
      setLastMessage(typeof data.lastMessage === 'string' && data.lastMessage ? data.lastMessage : null);
    }
    if ('lastError' in data) {
      setError(typeof data.lastError === 'string' && data.lastError ? data.lastError : null);
    }
  }, []);

  const start = useCallback(async (startOptions: StartOptions = {}) => {
    if (startRequestInFlightRef.current) {
      return;
    }
    startRequestInFlightRef.current = true;
    setLoading(true);
    setError(null);
    if (startOptions.forceRefresh) {
      setPairUrl('');
      setPairQrCode(null);
    }

    try {
      const result = await window.electron.ipcRenderer.invoke('weixin:startPairing', startOptions) as {
        success?: boolean;
        cancelled?: boolean;
        error?: string;
        result?: WeixinOnboardingResult;
        status?: unknown;
      };

      if (result?.cancelled) {
        setLoading(false);
        return;
      }

      if (!result?.success) {
        throw new Error(result?.error || 'start Weixin onboarding failed');
      }

      if (typeof result.result?.pairUrl === 'string') {
        setPairUrl(result.result.pairUrl);
      }
      if (typeof result.result?.pairQrCode === 'string') {
        setPairQrCode(result.result.pairQrCode);
      }

      applyStatus(result.status);
      setError(null);
    } catch (startError) {
      const message = startError instanceof Error ? startError.message : String(startError);
      setError(message);
      setPhase('error');
      setLoading(false);
    } finally {
      startRequestInFlightRef.current = false;
    }
  }, [applyStatus]);

  const clearBinding = useCallback(async () => {
    if (clearRequestInFlightRef.current) {
      return false;
    }
    clearRequestInFlightRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const result = await window.electron.ipcRenderer.invoke('weixin:clearBinding', {
        accountId: accountId || undefined,
      }) as {
        success?: boolean;
        error?: string;
        status?: unknown;
      };

      if (!result?.success) {
        throw new Error(result?.error || 'clear Weixin binding failed');
      }

      applyStatus(result.status);
      setPairUrl('');
      setPairQrCode(null);
      return true;
    } catch (clearError) {
      const message = clearError instanceof Error ? clearError.message : String(clearError);
      setError(message);
      setPhase('error');
      return false;
    } finally {
      setLoading(false);
      clearRequestInFlightRef.current = false;
    }
  }, [accountId, applyStatus]);

  useEffect(() => {
    const onPairUrl = (...args: unknown[]) => {
      const payload = args[0] as WeixinOnboardingResult | undefined;
      if (typeof payload?.pairUrl === 'string') {
        setPairUrl(payload.pairUrl);
      }
      if (typeof payload?.pairQrCode === 'string') {
        setPairQrCode(payload.pairQrCode);
      }
      setError(null);
      setPhase('waiting_scan');
      setLoading(false);
    };

    const onConnected = () => {
      setConfigured(true);
      setPhase('configured');
      setPairUrl('');
      setPairQrCode(null);
      setError(null);
      setLoading(false);
      onConnectedRef.current?.();
    };

    const onStatus = (...args: unknown[]) => {
      applyStatus(args[0]);
    };

    const onError = (...args: unknown[]) => {
      const payload = args[0] as { message?: string } | undefined;
      const message = String(payload?.message || '').trim();
      if (message) {
        setError(message);
      }
      setPhase('error');
      setLoading(false);
    };

    const removePairListener = window.electron.ipcRenderer.on('weixin:pair-url', onPairUrl);
    const removeConnectedListener = window.electron.ipcRenderer.on('weixin:connected', onConnected);
    const removeStatusListener = window.electron.ipcRenderer.on('weixin:status', onStatus);
    const removeErrorListener = window.electron.ipcRenderer.on('weixin:error', onError);

    return () => {
      if (typeof removePairListener === 'function') removePairListener();
      if (typeof removeConnectedListener === 'function') removeConnectedListener();
      if (typeof removeStatusListener === 'function') removeStatusListener();
      if (typeof removeErrorListener === 'function') removeErrorListener();
    };
  }, [applyStatus]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await window.electron.ipcRenderer.invoke('weixin:getStatus') as {
          success?: boolean;
          status?: unknown;
        };

        if (cancelled || !result?.success) {
          return;
        }

        applyStatus(result.status);

        const data = result.status as WeixinOnboardingStatus | undefined;
        if (
          options.autoStart
          && !autoStartedRef.current
          && data?.configured !== true
          && !data?.pairUrl
        ) {
          autoStartedRef.current = true;
          void start();
        }
      } catch {
        // ignore bootstrap status failures
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyStatus, options.autoStart, start]);

  return {
    accountId,
    configured,
    error,
    lastMessage,
    loading,
    pairQrCode,
    pairUrl,
    phase,
    pluginInstalled,
    clearBinding,
    start,
  };
}
