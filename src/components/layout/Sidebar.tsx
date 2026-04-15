/**
 * Sidebar Component
 * Synced from the latest ClawX session-sidebar structure, adapted for LawClaw branding/routes.
 */
import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  Bot,
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
import { useAgentsStore } from '@/stores/agents';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors',
          'text-foreground/80 hover:bg-muted/70 hover:text-foreground',
          isActive ? 'bg-muted text-foreground shadow-sm' : '',
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
  const isGatewayReady = isGatewayRunning && gatewayStatus.gatewayReady !== false;
  const agents = useAgentsStore((state) => state.agents);
  const fetchAgents = useAgentsStore((state) => state.fetchAgents);

  const navigate = useNavigate();
  const isOnChat = useLocation().pathname === '/';
  const { t } = useTranslation(['common', 'chat']);

  const [sessionToDelete, setSessionToDelete] = useState<{ key: string; label: string } | null>(null);
  const [nowMs, setNowMs] = useState(INITIAL_NOW_MS);

  useEffect(() => {
    if (!isGatewayReady) return;
    let cancelled = false;
    const hasExistingMessages = useChatStore.getState().messages.length > 0;
    (async () => {
      await loadSessions();
      if (cancelled) return;
      if (hasExistingMessages) {
        await loadHistory(true);
        return;
      }
      await loadHistory(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isGatewayReady, loadHistory, loadSessions]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  const getSessionLabel = (key: string, displayName?: string, label?: string) =>
    sessionLabels[key] ?? label ?? displayName ?? key;

  const agentNameById = useMemo(
    () => Object.fromEntries((agents ?? []).map((agent) => [agent.id, agent.name])),
    [agents],
  );

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
    { to: '/agents', icon: <Bot className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.agents') },
    { to: '/channels', icon: <Radio className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.channels') },
    { to: '/skills', icon: <Puzzle className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.skills') },
    { to: '/cron', icon: <Clock className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.cronTasks') },
    { to: '/dashboard', icon: <Home className="h-[18px] w-[18px]" strokeWidth={2} />, label: t('sidebar.dashboard') },
  ];

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col overflow-hidden border-r bg-background transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div
        className={cn(
          'flex h-14 items-center border-b border-border/60 bg-background/95 px-3',
          sidebarCollapsed ? 'justify-center' : 'justify-between'
        )}
      >
        {!sidebarCollapsed && (
          <div className="min-w-0 flex-1">
            <span className="truncate whitespace-nowrap text-[15px] font-semibold tracking-tight text-foreground/90">
              劳有钳
            </span>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
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

      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={() => {
            const { messages } = useChatStore.getState();
            if (messages.length > 0) newSession();
            navigate('/');
          }}
          className={cn(
            'mb-1.5 flex w-full items-center gap-2.5 rounded-xl border border-border/60 bg-muted/60 px-3 py-2.5 text-[14px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted',
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
      </div>

      <div className="min-h-0 flex-1 px-3 pb-3">
        {!sidebarCollapsed && sessions.length > 0 && (
          <div className="h-full space-y-2 overflow-y-auto overflow-x-hidden pt-1">
            {sessionBuckets.map((bucket) =>
              bucket.sessions.length > 0 ? (
                <div key={bucket.key} className="pt-1">
                  <div className="px-1 pb-1.5 text-[11px] font-semibold tracking-tight text-muted-foreground/70">
                    {bucket.label}
                  </div>
                  {bucket.sessions.map((session) => {
                    const agentId = getAgentLabelFromSession(session);
                    const agentLabel = agentNameById[agentId] || (agentId === 'lawclaw-main' ? 'LawClaw' : agentId);
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
                            'w-full rounded-xl border border-transparent px-2.5 py-2 pr-8 text-left text-[13px] transition-colors',
                            'hover:border-border/60 hover:bg-muted/60',
                            isOnChat && currentSessionKey === session.key
                              ? 'border-border/70 bg-muted/85 font-medium text-foreground shadow-sm'
                              : 'text-foreground/75'
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="shrink-0 rounded-full border border-border/60 bg-background px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
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
                            'absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-md p-1 transition-opacity',
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
      </div>

      <nav className="mt-auto flex flex-col gap-1 border-t border-border/60 bg-background/90 px-3 pb-3 pt-3">
        {navItems.map((item) => (
          <NavItem key={item.to} {...item} collapsed={sidebarCollapsed} />
        ))}
        <NavItem
          to="/settings"
          icon={<SettingsIcon className="h-[18px] w-[18px]" strokeWidth={2} />}
          label={t('common:sidebar.settings')}
          collapsed={sidebarCollapsed}
        />
      </nav>

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
