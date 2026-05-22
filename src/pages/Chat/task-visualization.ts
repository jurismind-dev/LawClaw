import type { RawMessage, ToolStatus } from '@/stores/chat';
import {
  extractText,
  extractTextSegments,
  extractThinkingSegments,
  extractToolUse,
} from './message-utils';

export type TaskStepStatus = 'running' | 'completed' | 'error';

export interface TaskStep {
  id: string;
  label: string;
  status: TaskStepStatus;
  kind: 'thinking' | 'tool' | 'system' | 'message';
  detail?: string;
  depth: number;
  parentId?: string;
  url?: string;
}

export function findReplyMessageIndex(messages: RawMessage[], hasStreamingReply: boolean): number {
  if (hasStreamingReply) return -1;
  for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
    const message = messages[idx];
    if (!message || message.role !== 'assistant') continue;
    if (extractText(message).trim().length === 0) continue;
    return idx;
  }
  return -1;
}

export function hasActiveStreamingReplyInRun(
  isLatestOpenRun: boolean,
  hasAnyStreamContent: boolean,
  streamingReplyText: string | null
): boolean {
  return isLatestOpenRun && (hasAnyStreamContent || streamingReplyText != null);
}

export function buildRunSegmentMessageIndices(
  messages: RawMessage[],
  nextUserMessageIndexes: number[],
  isRunTrigger: (message: RawMessage, index: number) => boolean
): Set<number> {
  const indices = new Set<number>();
  messages.forEach((message, triggerIndex) => {
    if (!isRunTrigger(message, triggerIndex)) return;
    const nextUserIndex = nextUserMessageIndexes[triggerIndex];
    const segmentEnd = nextUserIndex === -1 ? messages.length - 1 : nextUserIndex - 1;
    for (let idx = triggerIndex + 1; idx <= segmentEnd; idx += 1) {
      indices.add(idx);
    }
  });

  let firstTriggerIndex = -1;
  for (let idx = 0; idx < messages.length; idx += 1) {
    if (isRunTrigger(messages[idx], idx)) {
      firstTriggerIndex = idx;
      break;
    }
  }
  if (firstTriggerIndex > 0) {
    for (let idx = 0; idx < firstTriggerIndex; idx += 1) {
      if (messages[idx]?.role === 'assistant') {
        indices.add(idx);
      }
    }
  }

  return indices;
}

export function getPostTriggerSegmentMessages(
  messages: RawMessage[],
  triggerIndex: number,
  nextUserIndex: number
): RawMessage[] {
  const segmentEnd = nextUserIndex === -1 ? messages.length : nextUserIndex;
  return messages.slice(triggerIndex + 1, segmentEnd);
}

export function getRunSegmentMessages(
  messages: RawMessage[],
  triggerIndex: number,
  nextUserIndex: number,
  isRunTrigger: (message: RawMessage, index: number) => boolean
): RawMessage[] {
  const segmentEnd = nextUserIndex === -1 ? messages.length : nextUserIndex;
  const core = messages.slice(triggerIndex + 1, segmentEnd);
  const hasEarlierUser = messages.some((message, index) => index < triggerIndex && isRunTrigger(message, index));
  if (hasEarlierUser || triggerIndex === 0) return core;
  const orphans = messages.slice(0, triggerIndex).filter((message) => message.role === 'assistant');
  return [...orphans, ...core];
}

interface DeriveTaskStepsInput {
  messages: RawMessage[];
  streamingMessage: unknown | null;
  streamingTools: ToolStatus[];
  sending?: boolean;
  pendingFinal?: boolean;
  showThinking?: boolean;
  omitLastStreamingMessageSegment?: boolean;
}

function normalizeText(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const normalized = text.replace(/[ \t]+/g, ' ').trim();
  return normalized || undefined;
}

function makeToolId(prefix: string, name: string, index: number): string {
  return `${prefix}:${name}:${index}`;
}

function isSpawnLikeStep(label: string): boolean {
  return /(spawn|subagent|delegate|parallel)/i.test(label);
}

function tryParseJsonObject(detail: string | undefined): Record<string, unknown> | null {
  if (!detail) return null;
  try {
    const parsed = JSON.parse(detail) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function extractBranchAgent(step: TaskStep): string | null {
  const parsed = tryParseJsonObject(step.detail);
  const agentId = parsed?.agentId;
  if (typeof agentId === 'string' && agentId.trim()) return agentId.trim();

  const message = typeof parsed?.message === 'string' ? parsed.message : step.detail;
  if (!message) return null;
  const match = message.match(/\b(coder|reviewer|project-manager|manager|planner|researcher|worker|subagent)\b/i);
  return match ? match[1] : null;
}

function attachTopology(steps: TaskStep[]): TaskStep[] {
  const withTopology: TaskStep[] = [];
  let activeBranchNodeId: string | null = null;

  for (const step of steps) {
    if (step.kind === 'system') {
      activeBranchNodeId = null;
      withTopology.push({ ...step, depth: 1, parentId: 'agent-run' });
      continue;
    }

    if (/sessions_spawn/i.test(step.label)) {
      const branchAgent = extractBranchAgent(step) || 'subagent';
      const branchNodeId = `${step.id}:branch`;
      withTopology.push({ ...step, depth: 1, parentId: 'agent-run' });
      withTopology.push({
        id: branchNodeId,
        label: `${branchAgent} run`,
        status: step.status,
        kind: 'system',
        detail: `Spawned branch for ${branchAgent}`,
        depth: 2,
        parentId: step.id,
      });
      activeBranchNodeId = branchNodeId;
      continue;
    }

    if (/sessions_yield/i.test(step.label)) {
      withTopology.push({
        ...step,
        depth: activeBranchNodeId ? 3 : 1,
        parentId: activeBranchNodeId ?? 'agent-run',
      });
      activeBranchNodeId = null;
      continue;
    }

    if (step.kind === 'thinking' || step.kind === 'message') {
      withTopology.push({
        ...step,
        depth: activeBranchNodeId ? 3 : 1,
        parentId: activeBranchNodeId ?? 'agent-run',
      });
      continue;
    }

    if (isSpawnLikeStep(step.label)) {
      activeBranchNodeId = step.id;
      withTopology.push({
        ...step,
        depth: 1,
        parentId: 'agent-run',
      });
      continue;
    }

    withTopology.push({
      ...step,
      depth: activeBranchNodeId ? 3 : 1,
      parentId: activeBranchNodeId ?? 'agent-run',
    });
  }

  return withTopology;
}

function appendDetailSegments(
  segments: string[],
  options: {
    idPrefix: string;
    label: string;
    kind: Extract<TaskStep['kind'], 'thinking' | 'message'>;
    running: boolean;
    upsertStep: (step: TaskStep) => void;
  }
): void {
  const normalizedSegments = segments
    .map((segment) => normalizeText(segment))
    .filter((segment): segment is string => !!segment);

  normalizedSegments.forEach((detail, index) => {
    options.upsertStep({
      id: `${options.idPrefix}-${index}`,
      label: options.label,
      status: options.running && index === normalizedSegments.length - 1 ? 'running' : 'completed',
      kind: options.kind,
      detail,
      depth: 1,
    });
  });
}

export function deriveTaskSteps({
  messages,
  streamingMessage,
  streamingTools,
  sending = false,
  pendingFinal = false,
  showThinking = true,
  omitLastStreamingMessageSegment = false,
}: DeriveTaskStepsInput): TaskStep[] {
  const steps: TaskStep[] = [];
  const stepIndexById = new Map<string, number>();

  const upsertStep = (step: TaskStep): void => {
    const existingIndex = stepIndexById.get(step.id);
    if (existingIndex == null) {
      stepIndexById.set(step.id, steps.length);
      steps.push(step);
      return;
    }

    const existing = steps[existingIndex];
    steps[existingIndex] = {
      ...existing,
      ...step,
      detail: step.detail ?? existing.detail,
    };
  };

  const streamMessage =
    streamingMessage && typeof streamingMessage === 'object' ? (streamingMessage as RawMessage) : null;
  const replyIndex = findReplyMessageIndex(messages, streamMessage != null);

  for (const [messageIndex, message] of messages.entries()) {
    if (!message || message.role !== 'assistant') continue;

    if (showThinking) {
      appendDetailSegments(extractThinkingSegments(message), {
        idPrefix: `history-thinking-${message.id || messageIndex}`,
        label: 'Thinking',
        kind: 'thinking',
        running: false,
        upsertStep,
      });
    }

    const toolUses = extractToolUse(message);
    const narrationSegments = extractTextSegments(message);
    const graphNarrationSegments =
      messageIndex === replyIndex ? narrationSegments.slice(0, -1) : narrationSegments;
    appendDetailSegments(graphNarrationSegments, {
      idPrefix: `history-message-${message.id || messageIndex}`,
      label: 'Message',
      kind: 'message',
      running: false,
      upsertStep,
    });

    toolUses.forEach((tool, index) => {
      const input = tool.input as Record<string, unknown>;
      const url = tool.name === 'web_fetch' && typeof input?.url === 'string' ? input.url : undefined;
      upsertStep({
        id: tool.id || makeToolId(`history-tool-${message.id || messageIndex}`, tool.name, index),
        label: tool.name,
        status: 'completed',
        kind: 'tool',
        detail: normalizeText(JSON.stringify(tool.input, null, 2)),
        depth: 1,
        url,
      });
    });
  }

  if (streamMessage) {
    if (showThinking && !omitLastStreamingMessageSegment) {
      appendDetailSegments(extractThinkingSegments(streamMessage), {
        idPrefix: 'stream-thinking',
        label: 'Thinking',
        kind: 'thinking',
        running: true,
        upsertStep,
      });
    }

    const streamNarrationSegments = extractTextSegments(streamMessage);
    const graphStreamNarrationSegments = omitLastStreamingMessageSegment
      ? streamNarrationSegments.slice(0, -1)
      : streamNarrationSegments;
    appendDetailSegments(graphStreamNarrationSegments, {
      idPrefix: 'stream-message',
      label: 'Message',
      kind: 'message',
      running: !omitLastStreamingMessageSegment,
      upsertStep,
    });
  }

  const activeToolIds = new Set<string>();
  const activeToolNamesWithoutIds = new Set<string>();
  streamingTools.forEach((tool, index) => {
    const id = tool.toolCallId || tool.id || makeToolId('stream-status', tool.name, index);
    activeToolIds.add(id);
    if (!tool.toolCallId && !tool.id) {
      activeToolNamesWithoutIds.add(tool.name);
    }
    upsertStep({
      id,
      label: tool.name,
      status: tool.status,
      kind: 'tool',
      detail: normalizeText(tool.summary),
      depth: 1,
    });
  });

  if (streamMessage) {
    extractToolUse(streamMessage).forEach((tool, index) => {
      const id = tool.id || makeToolId('stream-tool', tool.name, index);
      if (activeToolIds.has(id) || activeToolNamesWithoutIds.has(tool.name)) return;
      const input = tool.input as Record<string, unknown>;
      const url = tool.name === 'web_fetch' && typeof input?.url === 'string' ? input.url : undefined;
      upsertStep({
        id,
        label: tool.name,
        status: 'running',
        kind: 'tool',
        detail: normalizeText(JSON.stringify(tool.input, null, 2)),
        depth: 1,
        url,
      });
    });
  }

  if (sending && pendingFinal) {
    upsertStep({
      id: 'system-finalizing',
      label: 'Finalizing answer',
      status: 'running',
      kind: 'system',
      detail: 'Waiting for the assistant to finish this run.',
      depth: 1,
    });
  } else if (sending && steps.length === 0) {
    upsertStep({
      id: 'system-preparing',
      label: 'Preparing run',
      status: 'running',
      kind: 'system',
      detail: 'Waiting for the first streaming update.',
      depth: 1,
    });
  }

  return attachTopology(steps);
}
