import { useEffect, useRef, useState } from 'react';
import { BookOpen, CheckCircle2, ExternalLink, Eye, EyeOff, Loader2, QrCode, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useFeishuOfficialOnboarding } from '@/hooks/useFeishuOfficialOnboarding';

interface FeishuOfficialOnboardingPanelProps {
  autoStart?: boolean;
  onConnected?: () => void;
}

type FeishuConnectMode = 'qr' | 'existing';

export function FeishuOfficialOnboardingPanel({
  autoStart = false,
  onConnected,
}: FeishuOfficialOnboardingPanelProps) {
  const { t } = useTranslation('channels');
  const autoStartedRef = useRef(false);
  const [mode, setMode] = useState<FeishuConnectMode>('qr');
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);

  const {
    configured,
    configureExistingApp,
    error,
    lastMessage,
    loading,
    pairQrCode,
    pairUrl,
    phase,
    pluginInstalled,
    resetFlow,
    start,
  } = useFeishuOfficialOnboarding({
    onConnected,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await window.electron.ipcRenderer.invoke('channel:getConfig', 'feishu') as {
          success?: boolean;
          config?: Record<string, unknown>;
        };
        if (cancelled || !result?.success || !result.config) {
          setBootstrapped(true);
          return;
        }

        const nextAppId = typeof result.config.appId === 'string' ? result.config.appId : '';
        const nextAppSecret = typeof result.config.appSecret === 'string' ? result.config.appSecret : '';
        setAppId(nextAppId);
        setAppSecret(nextAppSecret);

        if (nextAppId) {
          setMode('existing');
          void resetFlow();
        }
      } finally {
        if (!cancelled) {
          setBootstrapped(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resetFlow]);

  useEffect(() => {
    if (!autoStart || !bootstrapped || configured || mode !== 'qr' || pairUrl || autoStartedRef.current) {
      return;
    }

    autoStartedRef.current = true;
    void start();
  }, [autoStart, bootstrapped, configured, mode, pairUrl, start]);

  const openDocs = () => {
    const url = t('channels:meta.feishu.docsUrl');
    try {
      if (window.electron?.openExternal) {
        window.electron.openExternal(url);
      } else {
        window.open(url, '_blank');
      }
    } catch {
      window.open(url, '_blank');
    }
  };

  const statusLabel = configured
    ? t('dialog.feishuOfficial.statusConfigured')
    : phase === 'installing'
      ? t('dialog.feishuOfficial.statusInstalling')
      : mode === 'qr' && phase === 'polling'
        ? t('dialog.feishuOfficial.statusPolling')
        : mode === 'qr' && pairUrl
          ? t('dialog.feishuOfficial.statusWaiting')
          : loading || manualSaving
            ? t('dialog.feishuOfficial.statusLoading')
            : t('dialog.feishuOfficial.statusIdle');

  const handleConfigureExisting = async () => {
    if (!appId.trim() || !appSecret.trim()) {
      return;
    }

    setManualSaving(true);
    try {
      await configureExistingApp(appId, appSecret);
    } finally {
      setManualSaving(false);
    }
  };

  const handleModeChange = (nextMode: FeishuConnectMode) => {
    if (mode === nextMode) {
      return;
    }

    setMode(nextMode);
    void resetFlow();
  };

  return (
    <div className="space-y-4">
      <div className="bg-muted p-4 rounded-lg space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-sm">{t('dialog.feishuOfficial.modeLabel')}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {mode === 'qr'
                ? t('dialog.feishuOfficial.qrModeDescription')
                : t('dialog.feishuOfficial.existingModeDescription')}
            </p>
          </div>
          <Button variant="link" className="p-0 h-auto text-sm shrink-0" onClick={openDocs}>
            <BookOpen className="h-3 w-3 mr-1" />
            {t('dialog.viewDocs')}
            <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={mode === 'qr' ? 'default' : 'outline'}
            onClick={() => handleModeChange('qr')}
          >
            {t('dialog.feishuOfficial.modeQr')}
          </Button>
          <Button
            variant={mode === 'existing' ? 'default' : 'outline'}
            onClick={() => handleModeChange('existing')}
          >
            {t('dialog.feishuOfficial.modeExisting')}
          </Button>
        </div>
      </div>

      {configured && (
        <div className="bg-green-500/10 text-green-600 dark:text-green-400 p-3 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{t('dialog.feishuOfficial.configuredHint')}</span>
        </div>
      )}

      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <p className="text-xs text-muted-foreground">{t('dialog.feishuOfficial.statusLabel')}</p>
        <p className="text-sm font-medium flex items-center gap-2">
          <span
            className={cn(
              'inline-block h-2.5 w-2.5 rounded-full',
              configured
                ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.7)]'
                : error
                  ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                  : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]'
            )}
          />
          {statusLabel}
        </p>
        {pluginInstalled && (
          <p className="text-xs text-muted-foreground">{t('dialog.feishuOfficial.pluginReady')}</p>
        )}
        {lastMessage && !configured && (mode === 'qr' || manualSaving) && (
          <p className="text-xs text-muted-foreground">{lastMessage}</p>
        )}
        {error && (
          <p className="text-xs text-destructive break-all">{error}</p>
        )}
      </div>

      {mode === 'qr' ? (
        <>
          <div className="rounded-lg border bg-white p-3 flex flex-col items-center gap-2">
            {pairQrCode ? (
              <img src={pairQrCode} alt="Feishu Official QR" className="w-64 h-64 object-contain" />
            ) : (
              <div className="w-64 h-64 rounded-lg bg-muted/20 flex items-center justify-center">
                {loading ? (
                  <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                ) : (
                  <QrCode className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center">
              {t('dialog.feishuOfficial.scanTip')}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void start()} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('dialog.feishuOfficial.starting')}
                </>
              ) : (
                t('dialog.feishuOfficial.start')
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void start({ forceRefresh: true });
              }}
              disabled={loading}
            >
              <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
              {t('dialog.feishuOfficial.refresh')}
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-sm text-muted-foreground">
              {t('dialog.feishuOfficial.existingHint')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feishu-existing-app-id">
              {t('dialog.feishuOfficial.existingAppIdLabel')}
            </Label>
            <Input
              id="feishu-existing-app-id"
              placeholder={t('dialog.feishuOfficial.existingAppIdPlaceholder')}
              value={appId}
              onChange={(event) => setAppId(event.target.value)}
              autoComplete="off"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="feishu-existing-app-secret">
              {t('dialog.feishuOfficial.existingAppSecretLabel')}
            </Label>
            <div className="flex gap-2">
              <Input
                id="feishu-existing-app-secret"
                type={showSecret ? 'text' : 'password'}
                placeholder={t('dialog.feishuOfficial.existingAppSecretPlaceholder')}
                value={appSecret}
                onChange={(event) => setAppSecret(event.target.value)}
                autoComplete="off"
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowSecret((current) => !current)}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                void handleConfigureExisting();
              }}
              disabled={manualSaving || !appId.trim() || !appSecret.trim()}
            >
              {manualSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('dialog.feishuOfficial.savingExisting')}
                </>
              ) : (
                t('dialog.feishuOfficial.saveExisting')
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
