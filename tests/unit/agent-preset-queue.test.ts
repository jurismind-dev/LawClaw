import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  AGENT_PRESET_RETRY_MAX_DELAY_MS,
  AGENT_PRESET_RETRY_MIN_DELAY_MS,
  computeAgentPresetRetryDelayMs,
  listDueAgentPresetQueueTasks,
  readAgentPresetQueue,
  removeAgentPresetQueueTask,
  upsertAgentPresetQueueTask,
} from '@electron/utils/agent-preset-queue';

const tempDirs: string[] = [];

function createQueuePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lawclaw-queue-'));
  tempDirs.push(dir);
  return join(dir, 'agent-presets', 'queue.json');
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('agent preset queue', () => {
  it('支持任务持久化、更新与删除', () => {
    const queuePath = createQueuePath();
    const baseTask = {
      taskId: 'task-1',
      status: 'pending' as const,
      reason: 'LLM_UNAVAILABLE',
      targetHash: 'hash-v2',
      snapshotRef: '/tmp/snap',
      attempt: 0,
      nextRetryAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    };

    upsertAgentPresetQueueTask(queuePath, baseTask);
    let queue = readAgentPresetQueue(queuePath);
    expect(queue.tasks).toHaveLength(1);
    expect(queue.tasks[0].taskId).toBe('task-1');

    upsertAgentPresetQueueTask(queuePath, {
      ...baseTask,
      attempt: 2,
      updatedAt: new Date('2026-01-01T00:10:00.000Z').toISOString(),
    });

    queue = readAgentPresetQueue(queuePath);
    expect(queue.tasks).toHaveLength(1);
    expect(queue.tasks[0].attempt).toBe(2);

    queue = removeAgentPresetQueueTask(queuePath, 'task-1');
    expect(queue.tasks).toHaveLength(0);
  });

  it('重试退避随 attempt 增加且有上限', () => {
    const first = computeAgentPresetRetryDelayMs(1, 0.5);
    const second = computeAgentPresetRetryDelayMs(2, 0.5);
    const third = computeAgentPresetRetryDelayMs(3, 0.5);
    const large = computeAgentPresetRetryDelayMs(100, 0.5);

    expect(first).toBeGreaterThanOrEqual(AGENT_PRESET_RETRY_MIN_DELAY_MS);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
    expect(large).toBeLessThanOrEqual(AGENT_PRESET_RETRY_MAX_DELAY_MS);
  });

  it('仅返回到期的 pending/failed 任务', () => {
    const now = Date.parse('2026-01-01T12:00:00.000Z');
    const queue = {
      schemaVersion: 1,
      tasks: [
        {
          taskId: 'due-pending',
          status: 'pending' as const,
          reason: 'LLM_UNAVAILABLE',
          targetHash: 'hash-1',
          snapshotRef: '/tmp/1',
          attempt: 1,
          nextRetryAt: new Date(now - 1_000).toISOString(),
          createdAt: new Date(now - 10_000).toISOString(),
          updatedAt: new Date(now - 5_000).toISOString(),
        },
        {
          taskId: 'not-due',
          status: 'pending' as const,
          reason: 'LLM_UNAVAILABLE',
          targetHash: 'hash-1',
          snapshotRef: '/tmp/2',
          attempt: 1,
          nextRetryAt: new Date(now + 30_000).toISOString(),
          createdAt: new Date(now - 10_000).toISOString(),
          updatedAt: new Date(now - 5_000).toISOString(),
        },
        {
          taskId: 'due-failed',
          status: 'failed' as const,
          reason: 'APPLY_FAILED',
          targetHash: 'hash-1',
          snapshotRef: '/tmp/3',
          attempt: 1,
          nextRetryAt: new Date(now - 500).toISOString(),
          createdAt: new Date(now - 10_000).toISOString(),
          updatedAt: new Date(now - 5_000).toISOString(),
        },
        {
          taskId: 'awaiting',
          status: 'awaiting_confirmation' as const,
          reason: 'CONFLICT_NEED_CONFIRM',
          targetHash: 'hash-1',
          snapshotRef: '/tmp/4',
          attempt: 1,
          nextRetryAt: new Date(now - 500).toISOString(),
          createdAt: new Date(now - 10_000).toISOString(),
          updatedAt: new Date(now - 5_000).toISOString(),
        },
      ],
    };

    const due = listDueAgentPresetQueueTasks(queue, now);
    expect(due.map((task) => task.taskId)).toEqual(['due-pending', 'due-failed']);
  });
});

