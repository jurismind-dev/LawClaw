/**
 * Sidebar Component
 * Synced from the latest ClawX session-sidebar structure, adapted for LawClaw branding/routes.
 */
import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  Puzzle,
  Clock,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeft,
  Plus,
  Trash2,
  Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { useChatStore, type ChatSession } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { BotAvatar } from '@/components/common/BotAvatar';
import { useTranslation } from 'react-i18next';

type SessionBucketKey =
  | 'today'
  | 'yesterday'
  | 'withinWeek'
  | 'withinTwoWeeks'
  | 'withinMonth'
  | 'older';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  collapsed?: boolean;
}

function NavItem({ to, icon, label, collapsed }: NavItemProps) {
  return (
    <NavLink
      to={to}
      title={label}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-colors',
          'hover:bg-black/5 dark:hover:bg-white/5 text-foreground/80',
          isActive ? 'bg-black/5 text-foreground dark:bg-white/10' : '',
          collapsed && 'justify-center px-0'
        )
      }
    >
      {({ isActive }) => (
        <>
          <div
            className={cn(
              'flex shrink-0 items-center justify-center',
              isActive ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {icon}
          </div>
          {!collapsed && (
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
          )}
        </>
      )}
    </NavLink>
  );
}

function getSessionBucket(activityMs: number, nowMs: number): SessionBucketKey {
  if (!activityMs || activityMs <= 0) return 'older';

  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;

  if (activityMs >= startOfToday) return 'today';
  if (activityMs >= startOfYesterday) return 'yesterday';

  const daysAgo = (startOfToday - activityMs) / (24 * 60 * 60 * 1000);
  if (daysAgo <= 7) return 'withinWeek';
  if (daysAgo <= 14) return 'withinTwoWeeks';
  if (daysAgo <= 30) return 'withinMonth';
  return 'older';
}

const INITIAL_NOW_MS = Date.now();

function getAgentLabelFromSession(session: ChatSession): string {
  if (session.key.startsWith('agent:lawclaw-main:')) return 'LawClaw';
  if (session.key.startsWith('agent:main:')) return 'LawClaw';

  const parts = session.key.split(':');
  return parts[1] || 'LawClaw';
}

export function Sidebar() {
  const sidebarCollapsed = useSettingsStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore((state) => state.setSidebarCollapsed);

  const sessions = useChatStore((state) => state.sessions);
  const currentSessionKey = useChatStore((state) => state.currentSessionKey);
  const sessionLabels = useChatStore((state) => state.sessionLabels);
  const sessionLastActivity = useChatStore((state) => state.sessionLastActivity);
  const switchSession = useChatStore((state) => state.switchSession);
  const newSession = useChatStore((state) => state.newSession);
  const deleteSession = useChatStore((state) => state.deleteSession);
  const loadSessions = useChatStore((state) => state.loadSessions);
  const loadHistory = useChatStore((state) => state.loadHistory);

  const gatewayStatus = useGatewayStore((state) => state.status);
  const isGatewayRunning = gatewayStatus.state === 'running';

  const navigate = useNavigate();
  const isOnChat = useLocation().pathname === '/';
  const { t } = useTranslation(['common', 'chat']);

  const [sessionToDelete, setSessionToDelete] = useState<{ key: string; label: string } | null>(null);
  const [nowMs, setNowMs] = useState(INITIAL_NOW_MS);

  useEffect(() => {
    if (!isGatewayRunning) return;
    let cancelled = false;
    const hasExistingMessages = useChatStore.getState().messages.length > 0;
    (async () => {
      await loadSessions();
      if (cancelled) return;
      await loadHistory(hasExistingMessages);
    })();
    return () => {
      cancelled = true;
    };
  }, [isGatewayRunning, loadHistory, loadSessions]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const getSessionLabel = (key: string, displayName?: string, label?: string) =>
    sessionLabels[key] ?? label ?? displayName ?? key;

  const sessionBuckets: Array<{ key: SessionBucketKey; label: string; sessions: ChatSession[] }> = [
    { key: 'today', label: t('chat:historyBuckets.today'), sessions: [] },
    { key: 'yesterday', label: t('chat:historyBuckets.yesterday'), sessions: [] },
    { key: 'withinWeek', label: t('chat:historyBuckets.withinWeek'), sessions: [] },
    { key: 'withinTwoWeeks', label: t('chat:historyBuckets.withinTwoWeeks'), sessions: [] },
    { key: 'withinMonth', label: t('chat:historyBuckets.withinMonth'), sessions: [] },
    { key: 'older', label: t('chat:historyBuckets.older'), sessions: [] },
  ];
  const sessionBucketMap = Object.fromEntries(sessionBuckets.map((bucket) => [bucket.key, bucket])) as Record<
    SessionBucketKey,
    (typeof sessionBuckets)[number]
  >;

  for (const session of [...sessions].sort(
    (left, right) => (sessionLastActivity[right.key] ?? 0) - (sessionLastActivity[left.key] ?? 0),
  )) {
    const bucketKey = getSessionBucket(sessionLastActivity[session.key] ?? 0, nowMs);
    sessionBucketMap[bucketKey].sessions.push(session);
  }

  const navItems = [
    { to: '/channels', icon: <Radio className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.channels') },
    { to: '/skills', icon: <Puzzle className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.skills') },
    { to: '/cron', icon: <Clock className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.cronTasks') },
    { to: '/dashboard', icon: <Home className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.dashboard') },
  ];

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r bg-background transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className={cn('flex h-12 items-center p-2', sidebarCollapsed ? 'justify-center' : 'justify-between')}>
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 overflow-hidden px-2">
            <BotAvatar className="h-7 w-7 shrink-0 rounded-xl" />
            <span className="truncate whitespace-nowrap text-sm font-semibold text-foreground/90">劳有钳</span>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? t('common:sidebar.expandSidebar') : t('common:sidebar.collapseSidebar')}
          aria-label={sidebarCollapsed ? t('common:sidebar.expandSidebar') : t('common:sidebar.collapseSidebar')}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-[18px] w-[18px]" />
          ) : (
            <PanelLeftClose className="h-[18px] w-[18px]" />
          )}
        </Button>
      </div>

      <nav className="flex flex-col gap-0.5 px-2">
        <button
          type="button"
          onClick={() => {
            const { messages } = useChatStore.getState();
            if (messages.length > 0) newSession();
            navigate('/');
          }}
          className={cn(
            'mb-2 flex w-full items-center gap-2.5 rounded-lg border border-transparent bg-black/5 px-2.5 py-2 text-[14px] font-medium text-foreground transition-colors dark:bg-accent',
            sidebarCollapsed && 'justify-center px-0'
          )}
          title={t('common:sidebar.newChat')}
          aria-label={t('common:sidebar.newChat')}
        >
          <div className="flex shrink-0 items-center justify-center text-foreground/80">
            <Plus className="h-[18px] w-[18px]" strokeWidth={2} />
          </div>
          {!sidebarCollapsed && (
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
              {t('common:sidebar.newChat')}
            </span>
          )}
        </button>

        {navItems.map((item) => (
          <NavItem key={item.to} {...item} collapsed={sidebarCollapsed} />
        ))}
      </nav>

      {!sidebarCollapsed && sessions.length > 0 && (
        <div className="mt-4 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-2 pb-2">
          {sessionBuckets.map((bucket) =>
            bucket.sessions.length > 0 ? (
              <div key={bucket.key} className="pt-2">
                <div className="px-2.5 pb-1 text-[11px] font-medium tracking-tight text-muted-foreground/60">
                  {bucket.label}
                </div>
                {bucket.sessions.map((session) => {
                  const agentLabel = getAgentLabelFromSession(session);
                  const label = getSessionLabel(session.key, session.displayName, session.label);

                  return (
                    <div key={session.key} className="group relative flex items-center">
                      <button
                        type="button"
                        onClick={() => {
                          switchSession(session.key);
                          navigate('/');
                        }}
                        className={cn(
                          'w-full rounded-lg px-2.5 py-1.5 pr-7 text-left text-[13px] transition-colors',
                          'hover:bg-black/5 dark:hover:bg-white/5',
                          isOnChat && currentSessionKey === session.key
                            ? 'bg-black/5 font-medium text-foreground dark:bg-white/10'
                            : 'text-foreground/75'
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] font-medium text-foreground/70 dark:bg-white/[0.08]">
                            {agentLabel}
                          </span>
                          <span className="truncate">{label}</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        aria-label="Delete session"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSessionToDelete({
                            key: session.key,
                            label,
                          });
                        }}
                        className={cn(
                          'absolute right-1 flex items-center justify-center rounded p-0.5 transition-opacity',
                          'opacity-0 group-hover:opacity-100',
                          'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                        )}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null
          )}
        </div>
      )}

      <div className="mt-auto p-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-colors',
              'hover:bg-black/5 dark:hover:bg-white/5 text-foreground/80',
              isActive && 'bg-black/5 text-foreground dark:bg-white/10',
              sidebarCollapsed ? 'justify-center px-0' : ''
            )
          }
        >
          {({ isActive }) => (
            <>
              <div
                className={cn(
                  'flex shrink-0 items-center justify-center',
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                <SettingsIcon className="h-[18px] w-[18px]" strokeWidth={2} />
              </div>
              {!sidebarCollapsed && (
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  {t('common:sidebar.settings')}
                </span>
              )}
            </>
          )}
        </NavLink>

      </div>

      <ConfirmDialog
        open={!!sessionToDelete}
        title={t('common:actions.confirm')}
        message={t('common:sidebar.deleteSessionConfirm', { label: sessionToDelete?.label })}
        confirmLabel={t('common:actions.delete')}
        cancelLabel={t('common:actions.cancel')}
        variant="destructive"
        onConfirm={async () => {
          if (!sessionToDelete) return;
          await deleteSession(sessionToDelete.key);
          if (currentSessionKey === sessionToDelete.key) navigate('/');
          setSessionToDelete(null);
        }}
        onCancel={() => setSessionToDelete(null)}
      />
    </aside>
  );
}
