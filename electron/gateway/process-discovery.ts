export function isGatewayTokenMismatchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /gateway token mismatch/i.test(message) || /provide gateway auth token/i.test(message);
}

export function parseLsofListeningPids(output: string): number[] {
  const pids = output
    .split(/\r?\n/)
    .map(line => Number.parseInt(line.trim(), 10))
    .filter(pid => Number.isInteger(pid) && pid > 0);

  return Array.from(new Set(pids));
}

export function parseWindowsListeningPidsByPort(output: string, port: number): number[] {
  const wantedSuffix = `:${port}`;
  const pids = new Set<number>();

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const columns = trimmed.split(/\s+/);
    if (columns.length < 5) continue;

    const localAddress = columns[1] ?? '';
    const state = (columns[3] ?? '').toUpperCase();
    const pid = Number.parseInt(columns[4] ?? '', 10);

    if (state !== 'LISTENING') continue;
    if (!localAddress.endsWith(wantedSuffix)) continue;
    if (!Number.isInteger(pid) || pid <= 0) continue;

    pids.add(pid);
  }

  return Array.from(pids);
}
