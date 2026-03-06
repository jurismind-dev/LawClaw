import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, SkipForward, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { TitleBar } from '@/components/layout/TitleBar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type {
  PresetInstallProgressEvent,
  PresetInstallRunResult,
  PresetInstallStatusResult,
} from '@/types/preset-install';

type InstallStatus = 'pending' | 'installing' | 'completed' | 'failed';

interface InstallItemState {
  id: string;
  name: string;
  description: string;
  status: InstallStatus;
}

function toInstallStatus(status: PresetInstallProgressEvent['status']): InstallStatus {
  if (status === 'failed') return 'failed';
  if (status === 'completed' || status === 'skipped') return 'completed';
  if (status === 'installing' || status === 'verifying') return 'installing';
  return 'pending';
}

export function UpgradeInstalling() {
  const { t } = useTranslation('upgrade');
  const navigate = useNavigate();
  const [items, setItems] = useState<InstallItemState[]>([]);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const kindLabel = useCallback(
    (kind: 'skill' | 'plugin') => t(`kind.${kind}`),
    [t]
  );

  const applyStatus = useCallback((status: PresetInstallStatusResult) => {
    const nextItems = status.plannedItems.map((item) => ({
      id: `${item.kind}:${item.id}`,
      name: item.displayName,
      description: t('itemDesc', {
        kind: kindLabel(item.kind),
        version: item.targetVersion,
      }),
      status: 'pending' as InstallStatus,
    }));
    setItems(nextItems);
  }, [kindLabel, t]);

  const runInstall = useCallback(async (mode: 'run' | 'retry') => {
    setRunning(true);
    setErrorMessage(null);

    const channel = mode === 'retry' ? 'presetInstall:retry' : 'presetInstall:run';
    const result = await window.electron.ipcRenderer.invoke(channel, {
      phase: 'upgrade',
    }) as PresetInstallRunResult;

    if (!result.success) {
      setRunning(false);
      setErrorMessage(result.error || t('installFailed'));
      setItems((prev) => prev.map((item) => ({
        ...item,
        status: item.status === 'completed' ? 'completed' : 'failed',
      })));
      toast.error(t('installFailed'));
      return;
    }

    setProgress(100);
    setItems((prev) => prev.map((item) => ({
      ...item,
      status: item.status === 'failed' ? 'failed' : 'completed',
    })));
    toast.success(t('installSuccess'));
    navigate('/');
  }, [navigate, t]);

  useEffect(() => {
    let cancelled = false;
    const unsubscribeProgress = window.electron.ipcRenderer.on('presetInstall:progress', (rawEvent) => {
      const event = rawEvent as PresetInstallProgressEvent;
      if (event.phase !== 'upgrade') {
        return;
      }

      const key = `${event.kind}:${event.itemId}`;
      const nextStatus = toInstallStatus(event.status);
      setItems((prev) => {
        const existing = prev.find((item) => item.id === key);
        if (!existing) {
          return [
            ...prev,
            {
              id: key,
              name: event.displayName || event.itemId,
              description: t('itemDesc', { kind: kindLabel(event.kind), version: '-' }),
              status: nextStatus,
            },
          ];
        }
        return prev.map((item) => (item.id === key ? { ...item, status: nextStatus } : item));
      });

      setProgress((prev) => Math.max(prev, Math.min(99, event.progress)));
    });

    const bootstrap = async () => {
      try {
        const status = await window.electron.ipcRenderer.invoke(
          'presetInstall:getStatus'
        ) as PresetInstallStatusResult;
        if (cancelled) {
          return;
        }

        applyStatus(status);
        if (!status.pending) {
          navigate('/');
          return;
        }

        await runInstall('run');
      } catch (error) {
        if (cancelled) {
          return;
        }
        setRunning(false);
        setErrorMessage(String(error));
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      if (typeof unsubscribeProgress === 'function') {
        unsubscribeProgress();
      }
    };
  }, [applyStatus, kindLabel, navigate, runInstall, t]);

  const hasError = useMemo(() => Boolean(errorMessage), [errorMessage]);

  const getStatusIcon = (status: InstallStatus) => {
    switch (status) {
      case 'pending':
        return <div className="h-5 w-5 rounded-full border-2 border-slate-500" />;
      case 'installing':
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-400" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-400" />;
    }
  };

  const getStatusText = (status: InstallStatus) => {
    switch (status) {
      case 'pending':
        return <span className="text-muted-foreground">{t('status.pending')}</span>;
      case 'installing':
        return <span className="text-primary">{t('status.installing')}</span>;
      case 'completed':
        return <span className="text-green-400">{t('status.completed')}</span>;
      case 'failed':
        return <span className="text-red-400">{t('status.failed')}</span>;
    }
  };

  const handleRetry = async () => {
    setProgress(0);
    setItems((prev) => prev.map((item) => ({ ...item, status: 'pending' })));
    await runInstall('retry');
  };

  const handleSkipCurrent = async () => {
    try {
      await window.electron.ipcRenderer.invoke('presetInstall:skipCurrent');
      toast.warning(t('skipSuccess'));
      navigate('/');
    } catch (error) {
      setErrorMessage(String(error));
      toast.error(t('skipFailed'));
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />
      <div className="flex flex-1 items-center justify-center px-6 py-8">
        <div className="w-full max-w-2xl rounded-xl border bg-card p-8 text-card-foreground shadow-sm">
          <div className="mb-8 text-center">
            <h1 className="mb-2 text-2xl font-bold">{t('title')}</h1>
            <p className="text-muted-foreground">{t('subtitle')}</p>
          </div>

          <div className="mb-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('progress')}</span>
              <span className="text-primary">{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>

          <div className="mb-6 max-h-60 space-y-2 overflow-y-auto">
            {items.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">{t('noItems')}</p>
            )}
            {items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'flex items-center justify-between rounded-lg p-3',
                  item.status === 'installing' ? 'bg-muted' : 'bg-muted/50'
                )}
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(item.status)}
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </div>
                {getStatusText(item.status)}
              </div>
            ))}
          </div>

          {hasError && (
            <div className="mb-6 rounded-lg border border-red-500/50 bg-red-900/30 p-4 text-sm text-red-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                <div className="space-y-1">
                  <p className="font-semibold">{t('installFailed')}</p>
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-black/30 p-2 font-mono text-xs">
                    {errorMessage}
                  </pre>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              disabled={running}
              onClick={() => {
                void handleSkipCurrent();
              }}
            >
              <SkipForward className="mr-2 h-4 w-4" />
              {t('skipCurrent')}
            </Button>
            <Button
              disabled={running}
              onClick={() => {
                void handleRetry();
              }}
            >
              {running ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {t('retry')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UpgradeInstalling;
