export type PresetInstallPhase = 'setup' | 'upgrade';

export type PresetInstallItemKind = 'skill' | 'plugin';

export interface PresetInstallSkillItem {
  kind: 'skill';
  id: string;
  displayName?: string;
  targetVersion: string;
  artifactPath: string;
  sha256: string;
  installMode?: 'dir' | 'tgz';
}

export interface PresetInstallPluginItem {
  kind: 'plugin';
  id: string;
  displayName?: string;
  targetVersion: string;
  artifactPath: string;
  sha256: string;
  installMode?: 'dir' | 'tgz';
}

export type PresetInstallItem = PresetInstallSkillItem | PresetInstallPluginItem;

export interface PresetInstallManifest {
  schemaVersion: number;
  presetVersion: string;
  items: PresetInstallItem[];
}

export type PresetInstallItemStatus =
  | 'pending'
  | 'verifying'
  | 'installing'
  | 'completed'
  | 'skipped'
  | 'failed';

export interface PresetInstallProgressEvent {
  runId: string;
  phase: PresetInstallPhase;
  itemId: string;
  kind: PresetInstallItemKind;
  displayName: string;
  status: PresetInstallItemStatus;
  progress: number;
  message?: string;
}

export interface PresetInstallStatusResult {
  pending: boolean;
  running: boolean;
  forceSync: boolean;
  manifestHash: string;
  presetVersion: string;
  hasState: boolean;
  blockedReason?: 'needs-run' | 'last-failed';
  plannedItems: Array<{
    id: string;
    kind: PresetInstallItemKind;
    displayName: string;
    targetVersion: string;
  }>;
  lastResult?: {
    status: 'success' | 'failed' | 'skipped';
    manifestHash: string;
    message?: string;
    updatedAt: string;
  };
}

export interface PresetInstallRunParams {
  phase: PresetInstallPhase;
}

export interface PresetInstallRunResult {
  success: boolean;
  skipped?: boolean;
  message?: string;
  installed: string[];
  skippedItems: string[];
  failedItem?: string;
  error?: string;
}
