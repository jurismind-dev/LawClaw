export type LawClawProviderUiContext = 'setup' | 'settings';

export function shouldAutoSelectLawClawProvider(context: LawClawProviderUiContext): boolean {
  return context === 'setup';
}
