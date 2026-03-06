/**
 * Chat Page
 * Native React implementation communicating with OpenClaw Gateway
 * via gateway:rpc IPC. Session selector, thinking toggle, and refresh
 * are in the toolbar; messages render with markdown + streaming.
 */
import { useEffect, useRef } from 'react';
import { AlertCircle, Bot, Loader2, MessageSquare, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useChatStore, type RawMessage } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ChatToolbar } from './ChatToolbar';
import { extractImages, extractText, extractThinking, extractToolUse } from './message-utils';
import { useTranslation } from 'react-i18next';
import { useAgentPresetMigrationStore } from '@/stores/agent-preset-migration';

export function Chat() {
  const { t } = useTranslation('chat');
  const gatewayStatus = useGatewayStore((s) => s.status);
  const isGatewayRunning = gatewayStatus.state === 'running';

  const messages = useChatStore((s) => s.messages);
  const loading = useChatStore((s) => s.loading);
  const sending = useChatStore((s) => s.sending);
  const error = useChatStore((s) => s.error);
  const showThinking = useChatStore((s) => s.showThinking);
  const streamingMessage = useChatStore((s) => s.streamingMessage);
  const streamingTools = useChatStore((s) => s.streamingTools);
  const pendingFinal = useChatStore((s) => s.pendingFinal);
  const loadHistory = useChatStore((s) => s.loadHistory);
  const loadSessions = useChatStore((s) => s.loadSessions);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const abortRun = useChatStore((s) => s.abortRun);
  const clearError = useChatStore((s) => s.clearError);
  const migrationStatus = useAgentPresetMigrationStore((s) => s.status);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const openMigrationArtifactsDir = async () => {
    try {
      const artifactsDir = await window.electron.ipcRenderer.invoke(
        'agentPresetMigration:getArtifactsDir'
      ) as string;
      if (artifactsDir) {
        await window.electron.ipcRenderer.invoke('shell:showItemInFolder', artifactsDir);
      }
    } catch {
      // ignore
    }
  };

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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage, sending, pendingFinal]);

  if (!isGatewayRunning) {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="mb-4 h-12 w-12 text-yellow-500" />
        <h2 className="mb-2 text-xl font-semibold">{t('gatewayNotRunning')}</h2>
        <p className="max-w-md text-muted-foreground">{t('gatewayRequired')}</p>
      </div>
    );
  }

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
  const shouldRenderStreaming =
    sending &&
    (hasStreamText || hasStreamThinking || hasStreamTools || hasStreamImages || hasStreamToolStatus);
  const hasAnyStreamContent =
    hasStreamText || hasStreamThinking || hasStreamTools || hasStreamImages || hasStreamToolStatus;

  return (
    <div className="-m-6 flex flex-col" style={{ height: 'calc(100vh - 2.5rem)' }}>
      <div className="flex shrink-0 items-center justify-end px-4 py-2">
        <ChatToolbar />
      </div>

      {migrationStatus?.state === 'warning' && (
        <div className="px-4 pb-2">
          <div className="mx-auto max-w-4xl rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-300">
            <p className="font-medium">LawClaw 预设升级跳过了部分本地已修改的文件。</p>
            {migrationStatus.message && <p className="mt-1">{migrationStatus.message}</p>}
            {migrationStatus.skippedFiles ? (
              <p className="mt-1">
                已跳过 {migrationStatus.skippedFiles} 个文件：
                {migrationStatus.skippedTargets?.join(', ') || '未知文件'}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded border border-border bg-background px-3 py-1 text-xs"
                onClick={() => {
                  void openMigrationArtifactsDir();
                }}
              >
                打开迁移目录
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-4xl space-y-4">
          {loading && !sending ? (
            <div className="flex h-full items-center justify-center py-20">
              <LoadingSpinner size="lg" />
            </div>
          ) : messages.length === 0 && !sending ? (
            <WelcomeScreen />
          ) : (
            <>
              {messages.map((msg, idx) => (
                <ChatMessage key={msg.id || `msg-${idx}`} message={msg} showThinking={showThinking} />
              ))}

              {shouldRenderStreaming && (
                <ChatMessage
                  message={
                    (streamMsg
                      ? {
                          ...(streamMsg as Record<string, unknown>),
                          role: (typeof streamMsg.role === 'string'
                            ? streamMsg.role
                            : 'assistant') as RawMessage['role'],
                          content: streamMsg.content ?? streamText,
                          timestamp: streamMsg.timestamp,
                        }
                      : {
                          role: 'assistant',
                          content: streamText,
                        }) as RawMessage
                  }
                  showThinking={showThinking}
                  isStreaming
                  streamingTools={streamingTools}
                />
              )}

              {sending && pendingFinal && !shouldRenderStreaming && (
                <ActivityIndicator phase="tool_processing" />
              )}

              {sending && !pendingFinal && !hasAnyStreamContent && <TypingIndicator />}
            </>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {error && (
        <div className="border-t border-destructive/20 bg-destructive/10 px-4 py-2">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
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

      <ChatInput onSend={sendMessage} onStop={abortRun} disabled={!isGatewayRunning} sending={sending} />
    </div>
  );
}

function WelcomeScreen() {
  const { t } = useTranslation('chat');
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600">
        <Bot className="h-8 w-8 text-white" />
      </div>
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
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
        <Sparkles className="h-4 w-4" />
      </div>
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
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
        <Sparkles className="h-4 w-4" />
      </div>
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
