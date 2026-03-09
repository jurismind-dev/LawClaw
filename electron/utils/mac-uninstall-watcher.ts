import { app } from 'electron';
import { execFileSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';
import { logger } from './logger';
import { getClawXConfigDir, getOpenClawConfigDir } from './paths';

const WATCHER_LABEL = 'com.jurismind.lawclaw.cleanup';
const APP_ID = 'app.clawx.desktop';

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function getCurrentBundlePath(): string | null {
  if (process.platform !== 'darwin' || !app.isPackaged) {
    return null;
  }

  const bundlePath = resolve(process.execPath, '../../..');
  return bundlePath.endsWith('.app') ? bundlePath : null;
}

function getStandardInstallPaths(): string[] {
  return [
    '/Applications/LawClaw.app',
    join(homedir(), 'Applications', 'LawClaw.app'),
  ];
}

function isSupportedInstallPath(bundlePath: string): boolean {
  return getStandardInstallPaths().includes(bundlePath);
}

function getWatcherFiles() {
  const helperDir = join(getClawXConfigDir(), 'support', 'mac-uninstall-watcher');
  const plistDir = join(homedir(), 'Library', 'LaunchAgents');
  return {
    helperDir,
    scriptPath: join(helperDir, 'watch-cleanup.sh'),
    logPath: join(helperDir, 'watcher.log'),
    plistPath: join(plistDir, `${WATCHER_LABEL}.plist`),
  };
}

function bootoutWatcher(plistPath: string): void {
  if (typeof process.getuid !== 'function') {
    return;
  }

  try {
    execFileSync('launchctl', ['bootout', `gui/${process.getuid()}`, plistPath], { stdio: 'ignore' });
  } catch {
    // Ignore if not loaded yet.
  }
}

function bootstrapWatcher(plistPath: string): void {
  if (typeof process.getuid !== 'function') {
    return;
  }

  const domain = `gui/${process.getuid()}`;

  try {
    execFileSync('launchctl', ['bootstrap', domain, plistPath], { stdio: 'ignore' });
  } catch (error) {
    logger.warn('Failed to bootstrap macOS uninstall watcher:', error);
    return;
  }

  try {
    execFileSync('launchctl', ['enable', `${domain}/${WATCHER_LABEL}`], { stdio: 'ignore' });
  } catch {
    // Non-fatal on older macOS versions.
  }
}

export function disableMacUninstallWatcher(): void {
  if (process.platform !== 'darwin') {
    return;
  }

  const { helperDir, plistPath } = getWatcherFiles();
  bootoutWatcher(plistPath);

  try {
    rmSync(plistPath, { force: true });
  } catch {
    // ignore
  }

  try {
    rmSync(helperDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

export function ensureMacUninstallWatcher(): void {
  if (process.platform !== 'darwin') {
    return;
  }

  const bundlePath = getCurrentBundlePath();
  if (!bundlePath || !isSupportedInstallPath(bundlePath)) {
    disableMacUninstallWatcher();
    return;
  }

  const { helperDir, logPath, plistPath, scriptPath } = getWatcherFiles();
  mkdirSync(helperDir, { recursive: true });
  mkdirSync(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true });

  const cleanupDirs = [
    getClawXConfigDir(),
    getOpenClawConfigDir(),
    app.getPath('userData'),
    join(homedir(), 'Library', 'Application Support', 'ClawX'),
    join(homedir(), 'Library', 'Caches', 'LawClaw'),
    join(homedir(), 'Library', 'Caches', 'ClawX'),
    join(homedir(), 'Library', 'Logs', 'LawClaw'),
    join(homedir(), 'Library', 'Logs', 'ClawX'),
    join(homedir(), 'Library', 'Saved Application State', `${APP_ID}.savedState`),
  ];

  const standardPaths = getStandardInstallPaths();
  const otherPaths = standardPaths.filter((path) => path !== bundlePath);
  const cleanupCommands = cleanupDirs.map((dir) => `rm -rf ${shellQuote(dir)}`).join('\n');
  const otherPathChecks = otherPaths
    .map((path) => `if [ -d ${shellQuote(path)} ]; then exit 0; fi`)
    .join('\n');

  const script = `#!/bin/bash
set -euo pipefail

APP_PATH=${shellQuote(bundlePath)}
PLIST_PATH=${shellQuote(plistPath)}
HELPER_DIR=${shellQuote(helperDir)}

if [ -d "$APP_PATH" ]; then
  exit 0
fi

${otherPathChecks}

${cleanupCommands}
rm -f "$HOME/Library/Preferences/${APP_ID}.plist"
rm -f "$HOME/Library/Preferences/ByHost/${APP_ID}."*.plist 2>/dev/null || true

launchctl bootout "gui/$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
rm -f "$PLIST_PATH"
rm -rf "$HELPER_DIR"
`;

  writeFileSync(scriptPath, script, 'utf8');
  chmodSync(scriptPath, 0o755);

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${WATCHER_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>${scriptPath}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>StartInterval</key>
    <integer>600</integer>
    <key>StandardOutPath</key>
    <string>${logPath}</string>
    <key>StandardErrorPath</key>
    <string>${logPath}</string>
  </dict>
</plist>
`;

  const previousPlist = existsSync(plistPath) ? plistPath : null;
  if (previousPlist) {
    bootoutWatcher(plistPath);
  }

  writeFileSync(plistPath, plist, 'utf8');
  bootstrapWatcher(plistPath);
}
