/**
 * Chat Toolbar
 * Shows the current chat target plus quick refresh/thinking controls.
 */
import { useMemo } from 'react';
import { RefreshCw, Brain, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useChatStore } from '@/stores/chat';
import { useAgentsStore } from '@/stores/agents';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export function ChatToolbar() {
  const currentAgentId = useChatStore((s) => s.currentAgentId);
  const refresh = useChatStore((s) => s.refresh);
  const loading = useChatStore((s) => s.loading);
  const showThinking = useChatStore((s) => s.showThinking);
  const toggleThinking = useChatStore((s) => s.toggleThinking);
  const agents = useAgentsStore((s) => s.agents);
  const { t } = useTranslation('chat');

  const currentTargetName = useMemo(() => {
    return (agents ?? []).find((agent) => agent.id === currentAgentId)?.name
      ?? (currentAgentId === 'lawclaw-main' ? 'LawClaw' : currentAgentId || 'LawClaw');
  }, [agents, currentAgentId]);

  return (
    <div className="inline-flex items-center gap-2 rounded-2xl border border-border/70 bg-background/90 p-1.5 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.45)] backdrop-blur-sm">
      <div className="hidden min-w-0 items-center gap-2 rounded-xl bg-muted/55 px-2.5 py-1.5 sm:flex">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bot className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold tracking-tight text-muted-foreground/75">
            {t('toolbar.targetLabel')}
          </div>
          <div className="truncate text-[13px] font-semibold text-foreground">
            {currentTargetName}
          </div>
        </div>
        <span className="sr-only">{t('toolbar.currentAgent', { agent: currentTargetName })}</span>
      </div>

      <div className="flex items-center gap-1 rounded-xl bg-muted/45 p-1">
        {/* Refresh */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-background hover:text-foreground"
              onClick={() => refresh()}
              disabled={loading}
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>
            <p>{t('toolbar.refresh')}</p>
          </TooltipContent>
        </Tooltip>

        {/* Thinking Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-8 w-8 rounded-lg text-muted-foreground hover:bg-background hover:text-foreground',
                showThinking && 'bg-background text-primary shadow-sm hover:bg-background'
              )}
              onClick={toggleThinking}
            >
              <Brain className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>
            <p>{showThinking ? t('toolbar.hideThinking') : t('toolbar.showThinking')}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
