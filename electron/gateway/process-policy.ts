export interface RestartDeferralContext {
  state: 'stopped' | 'starting' | 'running' | 'error' | 'reconnecting';
  startLock: boolean;
}

export function shouldDeferRestart(context: RestartDeferralContext): boolean {
  return context.startLock || context.state === 'starting' || context.state === 'reconnecting';
}

export interface DeferredRestartActionContext extends RestartDeferralContext {
  hasPendingRestart: boolean;
  shouldReconnect: boolean;
}

export type DeferredRestartAction = 'none' | 'wait' | 'drop' | 'execute';

export function getDeferredRestartAction(
  context: DeferredRestartActionContext,
): DeferredRestartAction {
  if (!context.hasPendingRestart) return 'none';
  if (shouldDeferRestart(context)) return 'wait';
  if (!context.shouldReconnect) return 'drop';
  return 'execute';
}
