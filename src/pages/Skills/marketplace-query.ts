export function shouldAutoRefreshMarketplaceOnClear(previousQuery: string, nextQuery: string): boolean {
  return previousQuery.trim().length > 0 && nextQuery.trim().length === 0;
}
