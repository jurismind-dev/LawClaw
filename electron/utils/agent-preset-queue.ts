import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { readJson5File, writeJsonFile } from './openclaw-json5';

export const AGENT_PRESET_QUEUE_SCHEMA_VERSION = 1;
export const AGENT_PRESET_RETRY_MIN_DELAY_MS = 60 * 1000;
export const AGENT_PRESET_RETRY_MAX_DELAY_MS = 6 * 60 * 60 * 1000;

export type AgentPresetQueueTaskStatus =
  | 'pending'
  | 'running'
  | 'awaiting_confirmation'
  | 'failed';

export interface AgentPresetQueueTask {
  taskId: string;
  status: AgentPresetQueueTaskStatus;
  reason: string;
  sourceHash?: string;
  targetHash: string;
  forceLawclawAgentPreset?: boolean;
  snapshotRef: string;
  attempt: number;
  nextRetryAt: string;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

export interface AgentPresetQueueState {
  schemaVersion: number;
  tasks: AgentPresetQueueTask[];
}

function ensureParentDir(filePath: string): void {
  const parentDir = dirname(filePath);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }
}

export function createEmptyQueueState(): AgentPresetQueueState {
  return {
    schemaVersion: AGENT_PRESET_QUEUE_SCHEMA_VERSION,
    tasks: [],
  };
}

export function readAgentPresetQueue(queuePath: string): AgentPresetQueueState {
  const fallback = createEmptyQueueState();
  const state = readJson5File<AgentPresetQueueState>(queuePath, fallback);
  if (!state || !Array.isArray(state.tasks)) {
    return fallback;
  }
  const normalizedTasks = state.tasks
    .filter((task) => task && typeof task.taskId === 'string')
    .map((task) => {
      const record = task as AgentPresetQueueTask & {
        sourceVersion?: string;
        targetVersion?: string;
        forceMainAgentPreset?: boolean;
      };
      return {
        ...record,
        sourceHash: record.sourceHash ?? record.sourceVersion,
        targetHash: record.targetHash ?? record.targetVersion ?? 'unknown',
        forceLawclawAgentPreset:
          record.forceLawclawAgentPreset ?? record.forceMainAgentPreset ?? false,
      };
    });
  return {
    schemaVersion: AGENT_PRESET_QUEUE_SCHEMA_VERSION,
    tasks: normalizedTasks,
  };
}

export function writeAgentPresetQueue(queuePath: string, state: AgentPresetQueueState): void {
  ensureParentDir(queuePath);
  writeJsonFile(queuePath, {
    schemaVersion: AGENT_PRESET_QUEUE_SCHEMA_VERSION,
    tasks: state.tasks,
  });
}

export function upsertAgentPresetQueueTask(
  queuePath: string,
  task: AgentPresetQueueTask
): AgentPresetQueueState {
  const state = readAgentPresetQueue(queuePath);
  const existingIndex = state.tasks.findIndex((item) => item.taskId === task.taskId);
  if (existingIndex >= 0) {
    state.tasks[existingIndex] = task;
  } else {
    state.tasks.push(task);
  }
  writeAgentPresetQueue(queuePath, state);
  return state;
}

export function removeAgentPresetQueueTask(queuePath: string, taskId: string): AgentPresetQueueState {
  const state = readAgentPresetQueue(queuePath);
  state.tasks = state.tasks.filter((item) => item.taskId !== taskId);
  writeAgentPresetQueue(queuePath, state);
  return state;
}

export function listDueAgentPresetQueueTasks(
  state: AgentPresetQueueState,
  nowMs: number
): AgentPresetQueueTask[] {
  return state.tasks
    .filter((task) => {
      if (task.status !== 'pending' && task.status !== 'failed') {
        return false;
      }
      const nextRetryMs = Date.parse(task.nextRetryAt);
      return Number.isFinite(nextRetryMs) ? nextRetryMs <= nowMs : true;
    })
    .sort((a, b) => Date.parse(a.nextRetryAt) - Date.parse(b.nextRetryAt));
}

export function computeAgentPresetRetryDelayMs(
  attempt: number,
  randomValue: number
): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const exponential = Math.min(
    AGENT_PRESET_RETRY_MAX_DELAY_MS,
    AGENT_PRESET_RETRY_MIN_DELAY_MS * 2 ** (safeAttempt - 1)
  );
  const jitterSeed = Number.isFinite(randomValue) ? randomValue : 0.5;
  const jitter = (Math.max(0, Math.min(1, jitterSeed)) - 0.5) * 0.2;
  const withJitter = Math.round(exponential * (1 + jitter));
  return Math.max(AGENT_PRESET_RETRY_MIN_DELAY_MS, Math.min(AGENT_PRESET_RETRY_MAX_DELAY_MS, withJitter));
}
