export type AgentPresetMigrationState = 'idle' | 'running' | 'warning' | 'failed';

export interface AgentPresetMigrationStatus {
  state: AgentPresetMigrationState;
  reason?: 'PARTIAL_UPDATE' | 'APPLY_FAILED';
  message?: string;
  targetHash?: string;
  updatedFiles?: number;
  createdFiles?: number;
  skippedFiles?: number;
  skippedTargets?: string[];
  updatedAt: string;
}
