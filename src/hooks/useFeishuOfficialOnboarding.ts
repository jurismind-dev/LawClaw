import { useCallback, useEffect, useRef, useState } from 'react';

type FeishuOnboardingPhase =
  | 'idle'
  | 'installing'
  | 'waiting_scan'
  | 'polling'
  | 'configured'
  | 'error';

interface FeishuOnboardingStatus {
  phase?: FeishuOnboardingPhase;
  pluginInstalled?: boolean;
  configured?: boolean;
  pairUrl?: string | null;
  pairQrCode?: string | null;
  pairIssuedAt?: number | null;
  expiresAt?: number | null;
  lastError?: string | null;
  lastMessage?: string | null;
}

interface FeishuOnboardingResult {
  pairUrl?: string;
  pairQrCode?: string | null;
  pairIssuedAt?: number | null;
  expiresAt?: number | null;
}

interface StartOptions {
  forceRefresh?: boolean;
  resetAuth?: boolean;
  reinstallPlugin?: boolean;
}

interface UseFeishuOfficialOnboardingOptions {
  autoStart?: boolean;
  onConnected?: () => void;
}

export function useFeishuOfficialOnboarding(options: UseFeishuOfficialOnboardingOptions = {}) {
  const autoStartedRef = useRef(false);
  const onConnectedRef = useRef(options.onConnected);

  const [phase, setPhase] = useState<FeishuOnboardingPhase>('idle');
  const [configured, setConfigured] = useState(false);
  const [pluginInstalled, setPluginInstalled] = useState(false);
  const [pairUrl, setPairUrl] = useState('');
  const [pairQrCode, setPairQrCode] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    onConnectedRef.current = options.onConnected;
  }, [options.onConnected]);

  const applyStatus = useCallback((status: unknown) => {
    const data = status as FeishuOnboardingStatus | null;
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
    if ('lastMessage' in data) {
      setLastMessage(typeof data.lastMessage === 'string' && data.lastMessage ? data.lastMessage : null);
    }
    if ('lastError' in data) {
      setError(typeof data.lastError === 'string' && data.lastError ? data.lastError : null);
    }
  }, []);

  const start = useCallback(async (startOptions: StartOptions = {}) => {
    setLoading(true);
    setError(null);
    if (startOptions.forceRefresh || startOptions.resetAuth) {
      setPairUrl('');
      setPairQrCode(null);
    }

    try {
      const result = await window.electron.ipcRenderer.invoke('feishu:startPairing', startOptions) as {
        success?: boolean;
        error?: string;
        result?: FeishuOnboardingResult;
        status?: unknown;
      };

      if (!result?.success) {
        throw new Error(result?.error || 'start Feishu onboarding failed');
      }

      const pairPayload = result.result;
      if (typeof pairPayload?.pairUrl === 'string') {
        setPairUrl(pairPayload.pairUrl);
      }
      if (typeof pairPayload?.pairQrCode === 'string') {
        setPairQrCode(pairPayload.pairQrCode);
      }

      applyStatus(result.status);
      setError(null);
    } catch (startError) {
      const message = startError instanceof Error ? startError.message : String(startError);
      setError(message);
      setPhase('error');
      setLoading(false);
    }
  }, [applyStatus]);

  const configureExistingApp = useCallback(async (appId: string, appSecret: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await window.electron.ipcRenderer.invoke('feishu:configureExistingApp', {
        appId,
        appSecret,
      }) as {
        success?: boolean;
        error?: string;
        status?: unknown;
      };

      if (!result?.success) {
        throw new Error(result?.error || 'configure existing Feishu app failed');
      }

      applyStatus(result.status);
    } catch (configureError) {
      const message = configureError instanceof Error ? configureError.message : String(configureError);
      setError(message);
      setPhase('error');
      setLoading(false);
    }
  }, [applyStatus]);

  useEffect(() => {
    const onPairUrl = (...args: unknown[]) => {
      const payload = args[0] as FeishuOnboardingResult | undefined;
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

    const removePairListener = window.electron.ipcRenderer.on('feishu:pair-url', onPairUrl);
    const removeConnectedListener = window.electron.ipcRenderer.on('feishu:connected', onConnected);
    const removeStatusListener = window.electron.ipcRenderer.on('feishu:status', onStatus);
    const removeErrorListener = window.electron.ipcRenderer.on('feishu:error', onError);

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
        const result = await window.electron.ipcRenderer.invoke('feishu:getStatus') as {
          success?: boolean;
          status?: unknown;
        };

        if (cancelled || !result?.success) {
          return;
        }

        applyStatus(result.status);

        const data = result.status as FeishuOnboardingStatus | undefined;
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
    configured,
    error,
    lastMessage,
    loading,
    pairQrCode,
    pairUrl,
    phase,
    pluginInstalled,
    configureExistingApp,
    start,
  };
}
