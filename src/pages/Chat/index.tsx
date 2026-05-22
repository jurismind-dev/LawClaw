/**
 * Chat Page
 * Native React implementation communicating with OpenClaw Gateway
 * via gateway:rpc IPC. The sidebar owns session creation/switching;
 * the toolbar keeps quick refresh and thinking controls.
 */
import { useEffect } from 'react';
import { AlertCircle, ArrowDownToLine, ExternalLink, Loader2, MessageSquare, Sparkles, X } from 'lucide-react';
import { BotAvatar } from '@/components/common/BotAvatar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useChatStore, type RawMessage } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';
import { useAgentsStore } from '@/stores/agents';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ChatToolbar } from './ChatToolbar';
import { ExecutionGraphCard } from './ExecutionGraphCard';
import {
  extractImages,
  extractText,
  extractThinking,
  extractToolUse,
  normalizeMessageRole,
  stripProcessMessagePrefix,
} from './message-utils';
import {
  buildRunSegmentMessageIndices,
  deriveTaskSteps,
  findReplyMessageIndex,
  getPostTriggerSegmentMessages,
  getRunSegmentMessages,
  hasActiveStreamingReplyInRun,
} from './task-visualization';
import { useTranslation } from 'react-i18next';
import { useAgentPresetMigrationStore } from '@/stores/agent-preset-migration';
import { GATEWAY_SLOW_START_GUIDE_URL } from '@/lib/gateway-support';
import { useStickToBottomInstant } from '@/hooks/use-stick-to-bottom-instant';
import { useMinLoading } from '@/hooks/use-min-loading';
import type { TaskStep } from './task-visualization';

type GraphStepCacheEntry = {
  steps: TaskStep[];
  agentLabel: string;
  sessionLabel: string;
  segmentEnd: number;
  replyIndex: number | null;
  triggerIndex: number;
};

type UserRunCard = GraphStepCacheEntry & {
  active: boolean;
  messageStepTexts: string[];
  streamingReplyText: string | null;
};

const graphStepCacheStore = new Map<string, Record<string, GraphStepCacheEntry>>();

function isRenderableChatMessage(message: RawMessage): boolean {
  const role = typeof message.role === 'string' ? message.role.toLowerCase() : '';
  if (role === 'toolresult' || role === 'tool_result') return false;
  const text = extractText(message);
  if (text.trim().length > 0) return true;
  if (extractThinking(message)?.trim()) return true;
  if (extractToolUse(message).length > 0) return true;
  if (extractImages(message).length > 0) return true;
  return (message._attachedFiles || []).length > 0;
}

function getPrimaryMessageStepTexts(steps: TaskStep[]): string[] {
  return steps
    .filter((step) => step.kind === 'message' && step.parentId === 'agent-run' && !!step.detail)
    .map((step) => step.detail!);
}

function isRealUserMessage(message: RawMessage): boolean {
  if (normalizeMessageRole(message.role) !== 'user') return false;
  const content = message.content;
  if (!Array.isArray(content)) return true;
  const blocks = content as Array<{ type?: string }>;
  return blocks.length === 0 || !blocks.every((block) => block.type === 'tool_result' || block.type === 'toolResult');
}

export function Chat() {
  const { t } = useTranslation('chat');
  const gatewayStatus = useGatewayStore((s) => s.status);
  const isGatewayRunning = gatewayStatus.state === 'running';

  const messages = useChatStore((s) => s.messages);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const currentAgentId = useChatStore((s) => s.currentAgentId);
  const sessionLabels = useChatStore((s) => s.sessionLabels);
  const loading = useChatStore((s) => s.loading);
  const startupHistoryLoading = useChatStore((s) => s.startupHistoryLoading);
  const sessionsLoading = useChatStore((s) => s.sessionsLoading);
  const hasAppliedStartupDefault = useChatStore((s) => s.hasAppliedStartupDefault);
  const sending = useChatStore((s) => s.sending);
  const activeRunId = useChatStore((s) => s.activeRunId);
  const error = useChatStore((s) => s.error);
  const showThinking = useChatStore((s) => s.showThinking);
  const streamingMessage = useChatStore((s) => s.streamingMessage);
  const streamingTools = useChatStore((s) => s.streamingTools);
  const pendingFinal = useChatStore((s) => s.pendingFinal);
  const cleanupEmptySession = useChatStore((s) => s.cleanupEmptySession);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const abortRun = useChatStore((s) => s.abortRun);
  const clearError = useChatStore((s) => s.clearError);
  const migrationStatus = useAgentPresetMigrationStore((s) => s.status);
  const isCurrentWarningVisible = useAgentPresetMigrationStore((s) => s.isCurrentWarningVisible);
  const dismissCurrentWarning = useAgentPresetMigrationStore((s) => s.dismissCurrentWarning);
  const agents = useAgentsStore((s) => s.agents);
  const stickToBottom = useStickToBottomInstant(currentSessionKey);
  const { contentRef, scrollRef } = stickToBottom;
  const { scrollToBottom, isAtBottom } = stickToBottom;
  const minLoading = useMinLoading(loading && messages.length > 0);
  const graphStepCache = graphStepCacheStore.get(currentSessionKey) ?? {};
  const hasRenderableMessages = messages.some(isRenderableChatMessage);

  const handleOpenGatewaySlowStartGuide = async () => {
    try {
      await window.electron.ipcRenderer.invoke('shell:openExternal', GATEWAY_SLOW_START_GUIDE_URL);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    return () => {
      cleanupEmptySession();
    };
  }, [cleanupEmptySession]);

  const streamMsg =
    streamingMessage && typeof streamingMessage === 'object'
      ? (streamingMessage as { role?: string; content?: unknown; timestamp?: number })
      : null;
  const streamText = streamMsg
    ? extractText(streamMsg)
    : typeof streamingMessage === 'string'
      ? streamingMessage
      : '';
  const hasStreamText = streamText.trim().length > 0;
  const streamThinking = streamMsg ? extractThinking(streamMsg) : null;
  const hasStreamThinking = showThinking && !!streamThinking && streamThinking.trim().length > 0;
  const streamTools = streamMsg ? extractToolUse(streamMsg) : [];
  const hasStreamTools = streamTools.length > 0;
  const streamImages = streamMsg ? extractImages(streamMsg) : [];
  const hasStreamImages = streamImages.length > 0;
  const hasStreamToolStatus = streamingTools.length > 0;
  const hasRunningStreamToolStatus = streamingTools.some((tool) => tool.status === 'running');
  const isTaskRunning = sending || pendingFinal || activeRunId !== null;
  const isStartupHistoryLoading = isGatewayRunning
    && !hasRenderableMessages
    && !isTaskRunning
    && (sessionsLoading || startupHistoryLoading || !hasAppliedStartupDefault);
  const hasAnyStreamContent =
    hasStreamText || hasStreamThinking || hasStreamTools || hasStreamImages || hasStreamToolStatus;
  const shouldRenderStreaming =
    isTaskRunning && (hasStreamText || hasStreamTools || hasStreamImages || hasStreamToolStatus);
  const showScrollToLatest = (hasRenderableMessages || isTaskRunning) && !isAtBottom;
  const nextUserMessageIndexes = new Array<number>(messages.length).fill(-1);
  let nextUserMessageIndex = -1;
  for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
    nextUserMessageIndexes[idx] = nextUserMessageIndex;
    if (isRealUserMessage(messages[idx])) {
      nextUserMessageIndex = idx;
    }
  }

  const isRunTrigger = (message: RawMessage, index: number) => {
    void index;
    return isRealUserMessage(message);
  };

  const runSegmentMessageIndices = buildRunSegmentMessageIndices(
    messages,
    nextUserMessageIndexes,
    isRunTrigger
  );
  const foldedNarrationIndices = new Set<number>();

  const userRunCards: UserRunCard[] = messages.flatMap((message, idx) => {
    if (!isRealUserMessage(message)) return [];

    const runKey = message.id
      ? `msg-${message.id}`
      : `${currentSessionKey}:trigger-${idx}`;
    const nextUserIndex = nextUserMessageIndexes[idx];
    const postTriggerMessages = getPostTriggerSegmentMessages(messages, idx, nextUserIndex);
    const segmentMessages = getRunSegmentMessages(messages, idx, nextUserIndex, isRunTrigger);
    const hasToolActivity = postTriggerMessages.some(
      (candidate) => candidate.role === 'assistant' && extractToolUse(candidate).length > 0
    );
    let lastToolUseOffset = -1;
    for (let offset = postTriggerMessages.length - 1; offset >= 0; offset -= 1) {
      const candidate = postTriggerMessages[offset];
      if (candidate.role === 'assistant' && extractToolUse(candidate).length > 0) {
        lastToolUseOffset = offset;
        break;
      }
    }
    const hasFinalReply = postTriggerMessages.some((candidate, offset) => {
      if (offset <= lastToolUseOffset) return false;
      if (candidate.role !== 'assistant') return false;
      if (extractText(candidate).trim().length === 0) return false;
      const content = candidate.content;
      if (!Array.isArray(content)) return true;
      return !(content as Array<{ type?: string }>).some(
        (block) => block.type === 'tool_use' || block.type === 'toolCall'
      );
    });
    const runStillExecutingTools = hasToolActivity && !hasFinalReply;
    const isLatestRunSegment = nextUserIndex === -1;
    const isLatestOpenRun =
      isLatestRunSegment &&
      (isTaskRunning || hasAnyStreamContent || (runStillExecutingTools && !!activeRunId));

    const buildSteps = (omitLastStreamingMessageSegment: boolean): TaskStep[] =>
      deriveTaskSteps({
        messages: segmentMessages,
        streamingMessage: isLatestOpenRun ? streamingMessage : null,
        streamingTools: isLatestOpenRun ? streamingTools : [],
        sending: isLatestOpenRun ? sending : false,
        pendingFinal: isLatestOpenRun ? pendingFinal : false,
        showThinking,
        omitLastStreamingMessageSegment: isLatestOpenRun ? omitLastStreamingMessageSegment : false,
      });

    const allToolsCompleted = streamingTools.length > 0 && !hasRunningStreamToolStatus;
    const canPromoteStreamToBubble =
      pendingFinal ||
      allToolsCompleted ||
      hasToolActivity ||
      (!hasToolActivity && (hasStreamText || hasStreamImages));
    const rawStreamingReplyCandidate =
      isLatestOpenRun &&
      canPromoteStreamToBubble &&
      (hasStreamText || hasStreamImages) &&
      streamTools.length === 0 &&
      !hasRunningStreamToolStatus;

    let steps = buildSteps(rawStreamingReplyCandidate);
    let streamingReplyText: string | null = null;
    if (rawStreamingReplyCandidate) {
      const trimmedReplyText = stripProcessMessagePrefix(streamText, getPrimaryMessageStepTexts(steps));
      if (trimmedReplyText.trim().length > 0 || hasStreamImages) {
        streamingReplyText = trimmedReplyText;
      } else {
        steps = buildSteps(false);
      }
    }

    const hasActiveStreamingReply = hasActiveStreamingReplyInRun(
      isLatestOpenRun,
      hasAnyStreamContent,
      streamingReplyText
    );
    const replyIndexOffset = findReplyMessageIndex(postTriggerMessages, hasActiveStreamingReply);
    const replyIndex = replyIndexOffset === -1 ? null : idx + 1 + replyIndexOffset;

    const segmentAgentLabel =
      agents.find((agent) => agent.id === currentAgentId)?.name || currentAgentId;
    const segmentSessionLabel = sessionLabels[currentSessionKey] || currentSessionKey;

    if (steps.length === 0) {
      if (isLatestOpenRun && streamingReplyText == null) {
        const historyReplyOffset = findReplyMessageIndex(postTriggerMessages, false);
        if (historyReplyOffset >= 0 && !hasActiveStreamingReply) {
          return [];
        }
        return [{
          triggerIndex: idx,
          replyIndex,
          active: true,
          agentLabel: segmentAgentLabel,
          sessionLabel: segmentSessionLabel,
          segmentEnd: nextUserIndex === -1 ? messages.length - 1 : nextUserIndex - 1,
          steps: [],
          messageStepTexts: [],
          streamingReplyText: null,
        }];
      }
      const cached = graphStepCache[runKey];
      if (!cached) return [];
      const cleanedSteps = cached.steps.filter(
        (step) => !(step.kind === 'message' && step.id.startsWith('stream-message'))
      );
      return [{
        triggerIndex: idx,
        replyIndex: cached.replyIndex,
        active: false,
        agentLabel: cached.agentLabel,
        sessionLabel: cached.sessionLabel,
        segmentEnd: nextUserIndex === -1 ? messages.length - 1 : nextUserIndex - 1,
        steps: cleanedSteps,
        messageStepTexts: getPrimaryMessageStepTexts(cleanedSteps),
        streamingReplyText: null,
      }];
    }

    const segmentReplyOffset = findReplyMessageIndex(postTriggerMessages, hasActiveStreamingReply);
    for (let offset = 0; offset < postTriggerMessages.length; offset += 1) {
      if (offset === segmentReplyOffset) continue;
      const candidate = postTriggerMessages[offset];
      if (!candidate || candidate.role !== 'assistant') continue;
      const hasNarrationText = extractText(candidate).trim().length > 0;
      const hasThinking = !!extractThinking(candidate);
      if (!hasNarrationText && !hasThinking) continue;
      foldedNarrationIndices.add(idx + 1 + offset);
    }

    return [{
      triggerIndex: idx,
      replyIndex,
      active: isLatestOpenRun,
      agentLabel: segmentAgentLabel,
      sessionLabel: segmentSessionLabel,
      segmentEnd: nextUserIndex === -1 ? messages.length - 1 : nextUserIndex - 1,
      steps,
      messageStepTexts: getPrimaryMessageStepTexts(steps),
      streamingReplyText,
    }];
  });
  const hasActiveExecutionGraph = userRunCards.some((card) => card.active);
  const replyTextOverrides = new Map<number, string>();
  for (const card of userRunCards) {
    if (card.replyIndex == null) continue;
    const replyMessage = messages[card.replyIndex];
    if (!replyMessage || replyMessage.role !== 'assistant') continue;
    const fullReplyText = extractText(replyMessage);
    const trimmedReplyText = stripProcessMessagePrefix(fullReplyText, card.messageStepTexts);
    if (trimmedReplyText !== fullReplyText) {
      replyTextOverrides.set(card.replyIndex, trimmedReplyText);
    }
  }
  const streamingReplyText =
    userRunCards.find((card) => card.streamingReplyText != null)?.streamingReplyText ?? null;

  useEffect(() => {
    if (!isTaskRunning && !shouldRenderStreaming && !hasActiveExecutionGraph) return;
    if (!isAtBottom) return;
    void scrollToBottom({
      animation: 'smooth',
      wait: true,
      duration: 160,
    });
  }, [
    activeRunId,
    hasActiveExecutionGraph,
    hasAnyStreamContent,
    isAtBottom,
    isTaskRunning,
    messages.length,
    pendingFinal,
    scrollToBottom,
    shouldRenderStreaming,
    streamText,
    streamingTools,
  ]);

  useEffect(() => {
    if (userRunCards.length === 0) return;
    const current = graphStepCacheStore.get(currentSessionKey) ?? {};
    let changed = false;
    const next = { ...current };

    for (const card of userRunCards) {
      if (card.steps.length === 0) continue;
      const triggerMsg = messages[card.triggerIndex];
      const runKey = triggerMsg?.id
        ? `msg-${triggerMsg.id}`
        : `${currentSessionKey}:trigger-${card.triggerIndex}`;
      const existing = current[runKey];
      const sameSteps = !!existing
        && existing.steps.length === card.steps.length
        && existing.steps.every((step, index) => {
          const nextStep = card.steps[index];
          return nextStep
            && step.id === nextStep.id
            && step.label === nextStep.label
            && step.status === nextStep.status
            && step.kind === nextStep.kind
            && step.detail === nextStep.detail
            && step.depth === nextStep.depth
            && step.parentId === nextStep.parentId;
        });
      if (
        sameSteps
        && existing?.agentLabel === card.agentLabel
        && existing?.sessionLabel === card.sessionLabel
        && existing?.segmentEnd === card.segmentEnd
        && existing?.replyIndex === card.replyIndex
        && existing?.triggerIndex === card.triggerIndex
      ) {
        continue;
      }

      next[runKey] = {
        steps: card.steps,
        agentLabel: card.agentLabel,
        sessionLabel: card.sessionLabel,
        segmentEnd: card.segmentEnd,
        replyIndex: card.replyIndex,
        triggerIndex: card.triggerIndex,
      };
      changed = true;
    }

    if (changed) {
      graphStepCacheStore.set(currentSessionKey, next);
    }
  }, [currentSessionKey, messages, userRunCards]);

  if (!isGatewayRunning) {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="mb-4 h-12 w-12 text-yellow-500" />
        <h2 className="mb-2 text-xl font-semibold">{t('gatewayNotRunning')}</h2>
        <p className="max-w-md text-muted-foreground">{t('gatewayRequired')}</p>
        <div className="mt-6 flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground">{t('gatewaySlowStartHelp.title')}</p>
          <Button variant="outline" onClick={handleOpenGatewaySlowStartGuide}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {t('gatewaySlowStartHelp.action')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-3 pb-1 pt-2">
        <div className="flex w-full justify-end">
          <ChatToolbar />
        </div>
      </div>

      {migrationStatus?.state === 'warning' && isCurrentWarningVisible && (
        <div className="px-3 pb-2">
          <div className="relative w-full rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 pr-11 text-sm text-yellow-700 dark:text-yellow-300">
            <button
              type="button"
              aria-label="关闭预设升级冲突提醒"
              className="absolute right-3 top-3 rounded p-1 text-yellow-700/70 transition hover:bg-yellow-500/10 hover:text-yellow-800 dark:text-yellow-300/70 dark:hover:bg-yellow-500/20 dark:hover:text-yellow-200"
              onClick={dismissCurrentWarning}
            >
              <X className="h-4 w-4" />
            </button>
            <p className="font-medium">LawClaw 预设升级发现部分本地配置冲突。</p>
            <p className="mt-1">系统已跳过自动更新，你可以继续正常使用。</p>
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden px-3 py-2">
        <div ref={scrollRef} className="h-full min-h-0 overflow-y-auto">
          <div ref={contentRef} className="w-full space-y-4">
            {isStartupHistoryLoading ? (
              <HistoryLoadingScreen />
            ) : !hasRenderableMessages && !isTaskRunning ? (
              <WelcomeScreen />
            ) : (
              <>
                {messages.map((msg, idx) => {
                  if (foldedNarrationIndices.has(idx)) return null;

                  const suppressToolCards = runSegmentMessageIndices.has(idx);
                  const isToolOnlyAssistant =
                    normalizeMessageRole(msg.role) === 'assistant' &&
                    extractToolUse(msg).length > 0 &&
                    extractText(msg).trim().length === 0 &&
                    !extractThinking(msg);
                  if (suppressToolCards && isToolOnlyAssistant && !(msg._attachedFiles?.length)) {
                    return null;
                  }

                  return (
                    <div
                      key={msg.id || `msg-${idx}`}
                      className="space-y-3"
                      id={`chat-message-${idx}`}
                      data-testid={`chat-message-${idx}`}
                    >
                      <ChatMessage
                        message={msg}
                        showThinking={showThinking}
                        textOverride={replyTextOverrides.get(idx)}
                        suppressToolCards={suppressToolCards}
                        suppressProcessAttachments={suppressToolCards}
                      />
                      {userRunCards
                        .filter((card) => card.triggerIndex === idx)
                        .map((card) => (
                          <ExecutionGraphCard
                            key={`graph-${idx}`}
                            agentLabel={card.agentLabel}
                            sessionLabel={card.sessionLabel}
                            steps={card.steps}
                            active={card.active}
                            onJumpToTrigger={() => {
                              document.getElementById(`chat-message-${card.triggerIndex}`)?.scrollIntoView({
                                behavior: 'smooth',
                                block: 'center',
                              });
                            }}
                            onJumpToReply={() => {
                              if (card.replyIndex == null) return;
                              document.getElementById(`chat-message-${card.replyIndex}`)?.scrollIntoView({
                                behavior: 'smooth',
                                block: 'center',
                              });
                            }}
                          />
                        ))}
                    </div>
                  );
                })}

                {shouldRenderStreaming && (
                  streamingReplyText != null ||
                  !hasActiveExecutionGraph ||
                  (hasStreamText && streamTools.length === 0)
                ) && (
                  <ChatMessage
                    message={(() => {
                      const base = streamMsg
                        ? {
                            ...(streamMsg as Record<string, unknown>),
                            role: (typeof streamMsg.role === 'string'
                              ? streamMsg.role
                              : 'assistant') as RawMessage['role'],
                            content: streamMsg.content ?? streamText,
                            timestamp: streamMsg.timestamp,
                          }
                        : {
                            role: 'assistant' as const,
                            content: streamText,
                          };
                      if (streamingReplyText != null && Array.isArray(base.content)) {
                        return {
                          ...base,
                          content: (base.content as Array<{ type?: string }>).filter(
                            (block) => block.type !== 'thinking'
                          ),
                        } as RawMessage;
                      }
                      return base as RawMessage;
                    })()}
                    showThinking={showThinking}
                    textOverride={streamingReplyText ?? undefined}
                    suppressToolCards={hasActiveExecutionGraph || runSegmentMessageIndices.size > 0}
                    suppressProcessAttachments={hasActiveExecutionGraph || runSegmentMessageIndices.size > 0}
                    isStreaming
                    streamingTools={streamingReplyText != null ? [] : streamingTools}
                  />
                )}

                {isTaskRunning && pendingFinal && !shouldRenderStreaming && !hasActiveExecutionGraph && (
                  <ActivityIndicator phase="tool_processing" />
                )}

                {isTaskRunning && !pendingFinal && !hasAnyStreamContent && !hasActiveExecutionGraph && <TypingIndicator />}
              </>
            )}
          </div>
        </div>
        {showScrollToLatest && (
          <button
            type="button"
            onClick={() => void scrollToBottom({ animation: 'smooth', ignoreEscapes: true })}
            className="absolute bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-1.5 text-xs font-medium text-foreground shadow-lg shadow-black/10 backdrop-blur transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:shadow-black/30"
            aria-label={t('scrollToLatest', '跳转到最新对话')}
            title={t('scrollToLatest', '跳转到最新对话')}
            data-testid="chat-scroll-to-latest"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
            <span>{t('scrollToLatest', '跳转到最新对话')}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="border-t border-destructive/20 bg-destructive/10 px-3 py-2">
          <div className="flex w-full items-center justify-between">
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
            <button
              onClick={clearError}
              className="text-xs text-destructive/60 underline hover:text-destructive"
            >
              {t('common:actions.dismiss')}
            </button>
          </div>
        </div>
      )}

      <ChatInput
        onSend={sendMessage}
        onStop={abortRun}
        disabled={!isGatewayRunning}
        sending={sending}
        taskRunning={isTaskRunning}
      />

      {minLoading && !isTaskRunning && messages.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-xl bg-background/20 backdrop-blur-[1px]">
          <div className="rounded-full border border-border bg-background p-2.5 shadow-lg">
            <LoadingSpinner size="md" />
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryLoadingScreen() {
  const { t } = useTranslation('chat');
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-5 rounded-full border border-border bg-background p-3 shadow-sm">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
      <h2 className="mb-2 text-xl font-semibold">{t('historyLoading.title')}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{t('historyLoading.subtitle')}</p>
    </div>
  );
}

function WelcomeScreen() {
  const { t } = useTranslation('chat');
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <BotAvatar size="lg" className="mb-6" />
      <h2 className="mb-2 text-2xl font-bold">{t('welcome.title')}</h2>
      <p className="mb-8 max-w-md text-muted-foreground">{t('welcome.subtitle')}</p>

      <div className="grid w-full max-w-lg grid-cols-2 gap-4">
        {[
          { icon: MessageSquare, title: t('welcome.askQuestions'), desc: t('welcome.askQuestionsDesc') },
          { icon: Sparkles, title: t('welcome.creativeTasks'), desc: t('welcome.creativeTasksDesc') },
        ].map((item, i) => (
          <Card key={i} className="text-left">
            <CardContent className="p-4">
              <item.icon className="mb-2 h-6 w-6 text-primary" />
              <h3 className="font-medium">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <BotAvatar className="shrink-0" />
      <div className="rounded-2xl bg-muted px-4 py-3">
        <div className="flex gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: '0ms' }} />
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: '150ms' }} />
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

function ActivityIndicator({ phase }: { phase: 'tool_processing' }) {
  void phase;
  return (
    <div className="flex gap-3">
      <BotAvatar className="shrink-0" />
      <div className="rounded-2xl bg-muted px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span>Processing tool results...</span>
        </div>
      </div>
    </div>
  );
}

export default Chat;
