export function resolvePresetInstallRedirectPath(params: {
  setupComplete: boolean;
  pathname: string;
  pending: boolean;
}): string | null {
  if (!params.setupComplete || params.pathname.startsWith('/setup')) {
    return null;
  }
  if (params.pending && !params.pathname.startsWith('/upgrade-installing')) {
    return '/upgrade-installing';
  }
  if (!params.pending && params.pathname.startsWith('/upgrade-installing')) {
    return '/';
  }
  return null;
}
