/**
 * TitleBar Component
 * macOS: empty drag region (native traffic lights handled by hiddenInset).
 * Windows/Linux: icon + "LawClaw" on left, minimize/maximize/close on right.
 */
import { useState, useEffect } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { brandAssets } from '@/assets/branding';
import logoSvg from '@/assets/logo.svg';

const isMac = window.electron?.platform === 'darwin';

export function TitleBar() {
  const { t } = useTranslation('common');

  if (isMac) {
    return (
      <div className="drag-region flex h-10 shrink-0 items-center justify-end border-b bg-background px-3">
        <CoinAccessButton label={t('brand.getCoins')} />
      </div>
    );
  }

  return <WindowsTitleBar />;
}

function WindowsTitleBar() {
  const { t } = useTranslation('common');
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    // Check initial state
    window.electron.ipcRenderer.invoke('window:isMaximized').then((val) => {
      setMaximized(val as boolean);
    });
  }, []);

  const handleMinimize = () => {
    window.electron.ipcRenderer.invoke('window:minimize');
  };

  const handleMaximize = () => {
    window.electron.ipcRenderer.invoke('window:maximize').then(() => {
      window.electron.ipcRenderer.invoke('window:isMaximized').then((val) => {
        setMaximized(val as boolean);
      });
    });
  };

  const handleClose = () => {
    window.electron.ipcRenderer.invoke('window:close');
  };

  return (
    <div className="drag-region flex h-10 shrink-0 items-center justify-between border-b bg-background">
      {/* Left: Icon + App Name */}
      <div className="no-drag flex items-center gap-2 pl-3">
        <img src={logoSvg} alt="劳有钳" className="h-5 w-auto" />
        <span className="text-xs font-medium text-muted-foreground select-none">
          劳有钳
        </span>
      </div>

      {/* Right: Coin entry + Window Controls */}
      <div className="no-drag flex h-full items-center gap-2 pr-1">
        <CoinAccessButton label={t('brand.getCoins')} />
        <button
          onClick={handleMinimize}
          className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-accent transition-colors"
          title="最小化"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={handleMaximize}
          className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-accent transition-colors"
          title={maximized ? '还原' : '最大化'}
        >
          {maximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={handleClose}
          className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-red-500 hover:text-white transition-colors"
          title="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function CoinAccessButton({ label }: { label: string }) {
  const handleOpenCoinCenter = () => {
    const url = 'https://lawclaw.jurismind.com/recharge';

    if (window.electron?.openExternal) {
      void window.electron.openExternal(url);
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      type="button"
      onClick={handleOpenCoinCenter}
      className="no-drag inline-flex h-8 items-center gap-2 rounded-full border border-border/70 bg-background/80 px-2.5 text-xs font-medium text-foreground/85 shadow-sm transition-colors hover:bg-accent hover:text-foreground dark:bg-muted/35"
      aria-label={label}
      title={label}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full">
        <img src={brandAssets.coin} alt="" className="h-full w-full object-cover" />
      </span>
      <span className="leading-none">{label}</span>
    </button>
  );
}
