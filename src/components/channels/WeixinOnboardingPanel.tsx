import { CheckCircle2, ExternalLink, Loader2, QrCode, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useWeixinOnboarding } from '@/hooks/useWeixinOnboarding';

interface WeixinOnboardingPanelProps {
  autoStart?: boolean;
  onConnected?: () => void;
}

export function WeixinOnboardingPanel({
  autoStart = false,
  onConnected,
}: WeixinOnboardingPanelProps) {
  const { t } = useTranslation('channels');
  const {
    configured,
    clearBinding,
    error,
    lastMessage,
    loading,
    pairQrCode,
    phase,
    pluginInstalled,
    start,
  } = useWeixinOnboarding({
    autoStart,
    onConnected,
  });

  const statusLabel = configured
    ? t('dialog.weixin.statusConfigured')
    : phase === 'installing'
      ? t('dialog.weixin.statusInstalling')
      : phase === 'polling'
        ? t('dialog.weixin.statusPolling')
        : pairQrCode
          ? t('dialog.weixin.statusWaiting')
          : loading
            ? t('dialog.weixin.statusLoading')
            : t('dialog.weixin.statusIdle');

  const openDocs = () => {
    const url = t('channels:meta.openclaw-weixin.docsUrl');
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

  return (
    <div className="space-y-4">
      {configured && (
        <div className="bg-green-500/10 text-green-600 dark:text-green-400 p-3 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{t('dialog.weixin.configuredHint')}</span>
        </div>
      )}

      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t('dialog.weixin.statusLabel')}</p>
          <Button variant="link" className="h-auto p-0 text-xs" onClick={openDocs}>
            {t('dialog.viewDocs')}
            <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        </div>

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
          <p className="text-xs text-muted-foreground">{t('dialog.weixin.pluginReady')}</p>
        )}
        {lastMessage && !configured && (
          <p className="text-xs text-muted-foreground">{lastMessage}</p>
        )}
        {error && (
          <p className="text-xs text-destructive break-all">{error}</p>
        )}
      </div>

      <div className="rounded-lg border bg-white p-3 flex flex-col items-center gap-2">
        {pairQrCode ? (
          <img src={pairQrCode} alt="Weixin QR" className="w-64 h-64 object-contain" />
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
          {t('dialog.weixin.scanTip')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void start()} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('dialog.weixin.starting')}
            </>
          ) : (
            t('dialog.weixin.start')
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
          {t('dialog.weixin.refresh')}
        </Button>
        {configured && (
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={async () => {
              const cleared = await clearBinding();
              if (cleared) {
                toast.success(t('dialog.weixin.clearSuccess'));
              }
            }}
            disabled={loading}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t('dialog.weixin.clear')}
          </Button>
        )}
      </div>
    </div>
  );
}
