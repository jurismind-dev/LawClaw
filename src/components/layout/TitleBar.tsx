/**
 * TitleBar Component
 * macOS: empty drag region (native traffic lights handled by hiddenInset).
 * Windows/Linux: icon + "LawClaw" on left, minimize/maximize/close on right.
 */
import { useState, useEffect } from 'react';
import { Minus, Square, X, Copy, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { brandAssets } from '@/assets/branding';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProviderStore } from '@/stores/providers';
import logoSvg from '@/assets/logo.svg';
import helpIconSvg from '../../../icon/help.svg';

const JURISMIND_RECHARGE_URL = 'https://lawclaw.jurismind.com/recharge';
const JURISMIND_PROFILE_URL = 'https://lawclaw.jurismind.com/profile';
const LAWCLAW_HELP_CENTER_URL =
  'https://pcnz0er969s1.feishu.cn/wiki/IJLmwaiy0iIbqikqB9vcvZTinMc?from=from_copylink';

export function TitleBar() {
  const { t } = useTranslation('common');
  const location = useLocation();
  const isMac = window.electron?.platform === 'darwin';
  const showCoinAccessButton = !location.pathname.startsWith('/setup');
  const providers = useProviderStore((state) => state.providers);
  const fetchProviders = useProviderStore((state) => state.fetchProviders);
  const jurismindProvider = providers.find(
    (provider) => provider.type === 'jurismind' && provider.hasKey && Boolean(provider.openId)
  );

  useEffect(() => {
    if (!showCoinAccessButton) {
      return;
    }

    void fetchProviders();
  }, [fetchProviders, showCoinAccessButton, location.pathname]);

  if (isMac) {
    return (
      <div className="drag-region flex h-10 shrink-0 items-center justify-end border-b bg-background px-3">
        {showCoinAccessButton && (
          <TitleBarActions
            getCoinsLabel={t('brand.getCoins')}
            helpLabel={t('brand.helpCenter')}
            profileLabel={t('brand.profileCenter')}
            profileAvatarUrl={jurismindProvider?.avatar}
            showProfile={Boolean(jurismindProvider)}
          />
        )}
      </div>
    );
  }

  return (
    <WindowsTitleBar
      showCoinAccessButton={showCoinAccessButton}
      jurismindAvatarUrl={jurismindProvider?.avatar}
      showProfileCenter={Boolean(jurismindProvider)}
    />
  );
}

function WindowsTitleBar({
  showCoinAccessButton,
  jurismindAvatarUrl,
  showProfileCenter,
}: {
  showCoinAccessButton: boolean;
  jurismindAvatarUrl?: string;
  showProfileCenter: boolean;
}) {
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
        {showCoinAccessButton && (
          <TitleBarActions
            getCoinsLabel={t('brand.getCoins')}
            helpLabel={t('brand.helpCenter')}
            profileLabel={t('brand.profileCenter')}
            profileAvatarUrl={jurismindAvatarUrl}
            showProfile={showProfileCenter}
          />
        )}
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

function TitleBarActions({
  getCoinsLabel,
  helpLabel,
  profileLabel,
  profileAvatarUrl,
  showProfile,
}: {
  getCoinsLabel: string;
  helpLabel: string;
  profileLabel: string;
  profileAvatarUrl?: string;
  showProfile: boolean;
}) {
  return (
    <div className="no-drag flex h-8 items-center overflow-hidden rounded-full border border-border/60 bg-background/75 shadow-sm dark:bg-muted/30">
      <CoinAccessButton label={getCoinsLabel} />
      <span className="h-4 w-px bg-border/70" aria-hidden="true" />
      <HelpCenterButton label={helpLabel} />
      {showProfile && (
        <>
          <span className="h-4 w-px bg-border/70" aria-hidden="true" />
          <ProfileCenterButton label={profileLabel} avatarUrl={profileAvatarUrl} />
        </>
      )}
    </div>
  );
}

function CoinAccessButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={openJurismindCenter}
      className="inline-flex h-full items-center gap-1.5 px-2.5 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-muted/70 hover:text-foreground"
      aria-label={label}
      title={label}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full">
        <img src={brandAssets.coin} alt="" className="h-full w-full object-cover" />
      </span>
      <span className="whitespace-nowrap leading-none">{label}</span>
    </button>
  );
}

function HelpCenterButton({ label }: { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={openHelpCenter}
          className="flex h-full w-8 items-center justify-center text-muted-foreground/75 transition-colors hover:bg-muted/70 hover:text-foreground"
          aria-label={label}
        >
          <span
            aria-hidden="true"
            className="h-4 w-4 bg-current"
            style={{
              WebkitMask: `url("${helpIconSvg}") center / contain no-repeat`,
              mask: `url("${helpIconSvg}") center / contain no-repeat`,
            }}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={10} align="end">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function ProfileCenterButton({
  label,
  avatarUrl,
}: {
  label: string;
  avatarUrl?: string;
}) {
  const normalizedAvatarUrl = avatarUrl?.trim() || '';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={openJurismindProfile}
          className="flex h-full w-8 items-center justify-center text-muted-foreground/75 transition-colors hover:bg-muted/70 hover:text-foreground"
          aria-label={label}
        >
          {normalizedAvatarUrl ? (
            <img
              src={normalizedAvatarUrl}
              alt=""
              className="h-5 w-5 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-5 w-5 items-center justify-center">
              <UserRound className="h-4 w-4" />
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={10} align="end">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function openJurismindCenter() {
  if (window.electron?.openExternal) {
    void window.electron.openExternal(JURISMIND_RECHARGE_URL);
    return;
  }

  window.open(JURISMIND_RECHARGE_URL, '_blank', 'noopener,noreferrer');
}

function openJurismindProfile() {
  if (window.electron?.openExternal) {
    void window.electron.openExternal(JURISMIND_PROFILE_URL);
    return;
  }

  window.open(JURISMIND_PROFILE_URL, '_blank', 'noopener,noreferrer');
}

function openHelpCenter() {
  if (window.electron?.openExternal) {
    void window.electron.openExternal(LAWCLAW_HELP_CENTER_URL);
    return;
  }

  window.open(LAWCLAW_HELP_CENTER_URL, '_blank', 'noopener,noreferrer');
}
