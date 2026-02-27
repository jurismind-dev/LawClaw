export type AgentPresetMigrationState =
  | 'idle'
  | 'running'
  | 'queued'
  | 'awaiting_confirmation'
  | 'failed';

export type AgentPresetConflictDecision = 'preserve_user' | 'prefer_preset' | 'skip_this_time';

export interface AgentPresetMigrationStatus {
  state: AgentPresetMigrationState;
  chatLocked: boolean;
  queueLength: number;
  currentTaskId?: string;
  reason?: 'LLM_UNAVAILABLE' | 'CONFLICT_NEED_CONFIRM' | 'INVALID_OUTPUT' | 'APPLY_FAILED';
  message?: string;
  targetHash?: string;
  updatedAt: string;
}


