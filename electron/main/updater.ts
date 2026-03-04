/**
 * Auto-Updater Module
 * Hybrid updater:
 * 1) Tries electron-updater metadata flow first (latest-*.yml)
 * 2) Falls back to OSS installer checks when only .dmg/.exe are published
 *
 * OSS fallback checks version via installer object metadata:
 * - x-oss-meta-version
 * and opens installer URLs directly for download/install.
 */
import { autoUpdater, UpdateInfo, ProgressInfo, UpdateDownloadedEvent } from 'electron-updater';
import { BrowserWindow, app, ipcMain, shell } from 'electron';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';
import { setQuitting } from './app-state';

/** Base OSS URL (without trailing channel path). */
const DEFAULT_OSS_BASE_URL = 'https://lawclaw.oss-cn-shanghai.aliyuncs.com';

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

const OSS_BASE_URL = normalizeBaseUrl(process.env.LAWCLAW_OSS_BASE_URL || DEFAULT_OSS_BASE_URL);

export interface UpdateStatus {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  info?: UpdateInfo;
  progress?: ProgressInfo;
  error?: string;
}

export interface UpdaterEvents {
  'status-changed': (status: UpdateStatus) => void;
  'checking-for-update': () => void;
  'update-available': (info: UpdateInfo) => void;
  'update-not-available': (info: UpdateInfo) => void;
  'download-progress': (progress: ProgressInfo) => void;
  'update-downloaded': (event: UpdateDownloadedEvent) => void;
  'error': (error: Error) => void;
}

/**
 * Detect the update channel from a semver version string.
 * e.g. "0.1.8-alpha.0" → "alpha", "1.0.0-beta.1" → "beta", "1.0.0" → "latest"
 */
function detectChannel(version: string): string {
  const match = version.match(/-([a-zA-Z]+)/);
  return match ? match[1] : 'latest';
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/, '');
}

function compareNumericParts(a: number[], b: number[]): number {
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

function compareSemverLike(aRaw: string, bRaw: string): number {
  const a = normalizeVersion(aRaw);
  const b = normalizeVersion(bRaw);

  const [aCore, aPre] = a.split('-', 2);
  const [bCore, bPre] = b.split('-', 2);

  const aParts = aCore.split('.').map((item) => Number.parseInt(item, 10));
  const bParts = bCore.split('.').map((item) => Number.parseInt(item, 10));

  const coreCmp = compareNumericParts(aParts, bParts);
  if (coreCmp !== 0) return coreCmp;

  if (!aPre && bPre) return 1;
  if (aPre && !bPre) return -1;
  if (!aPre && !bPre) return 0;

  return (aPre || '').localeCompare(bPre || '', undefined, { numeric: true, sensitivity: 'base' });
}

function resolveChannelFromPreference(channel: 'stable' | 'beta' | 'dev'): string {
  return channel === 'stable' ? 'latest' : channel;
}

function normalizeRuntimeArch(arch: string): 'x64' | 'arm64' | null {
  if (arch === 'x64' || arch === 'arm64') return arch;
  return null;
}

function fileNameFromUrl(urlOrPath: string): string {
  try {
    const parsed = new URL(urlOrPath);
    return decodeURIComponent(parsed.pathname.split('/').pop() || '');
  } catch {
    const normalized = urlOrPath.replace(/\\/g, '/');
    return decodeURIComponent(normalized.split('/').pop() || normalized);
  }
}

export class AppUpdater extends EventEmitter {
  private mainWindow: BrowserWindow | null = null;
  private status: UpdateStatus = { status: 'idle' };
  private autoInstallTimer: NodeJS.Timeout | null = null;
  private autoInstallCountdown = 0;
  private activeChannel: string;
  private manualDownloadUrl: string | null = null;

  /** Delay (in seconds) before auto-installing a downloaded update. */
  private static readonly AUTO_INSTALL_DELAY_SECONDS = 5;

  constructor() {
    super();
    
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    
    autoUpdater.logger = {
      info: (msg: string) => logger.info('[Updater]', msg),
      warn: (msg: string) => logger.warn('[Updater]', msg),
      error: (msg: string) => logger.error('[Updater]', msg),
      debug: (msg: string) => logger.debug('[Updater]', msg),
    };

    // Resolve initial channel from app version (stable -> latest).
    const version = app.getVersion();
    this.activeChannel = detectChannel(version);
    this.applyFeedConfig();

    this.setupListeners();
  }

  /**
   * Set the main window for sending update events
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Get current update status
   */
  getStatus(): UpdateStatus {
    return this.status;
  }

  private applyFeedConfig(): void {
    const feedUrl = `${OSS_BASE_URL}/${this.activeChannel}`;
    logger.info(
      `[Updater] Version: ${app.getVersion()}, channel: ${this.activeChannel}, feedUrl: ${feedUrl}`
    );

    autoUpdater.channel = this.activeChannel;
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: feedUrl,
      useMultipleRangeRequest: false,
    });
  }

  private getManualArtifactName(): string | null {
    const runtimeArch = normalizeRuntimeArch(process.arch);
    if (!runtimeArch) return null;

    if (process.platform === 'darwin') {
      return runtimeArch === 'arm64' ? 'LawClaw-mac-arm64.dmg' : 'LawClaw-mac-x64.dmg';
    }

    if (process.platform === 'win32') {
      return runtimeArch === 'arm64' ? 'LawClaw-win-arm64.exe' : 'LawClaw-win-x64.exe';
    }

    return null;
  }

  private getManualArtifactUrl(): string | null {
    const artifactName = this.getManualArtifactName();
    if (!artifactName) return null;
    return `${OSS_BASE_URL}/${this.activeChannel}/${artifactName}`;
  }

  private isMissingUpdaterMetadataError(error: unknown): boolean {
    const message = (error as Error)?.message || String(error);
    return message.includes('.yml') && message.includes('404');
  }

  private hasMatchingArchInUpdateInfo(info: UpdateInfo): boolean {
    const runtimeArch = normalizeRuntimeArch(process.arch);
    if (!runtimeArch) return false;

    const files = Array.isArray((info as { files?: Array<{ url?: string; path?: string }> }).files)
      ? ((info as { files?: Array<{ url?: string; path?: string }> }).files || [])
      : [];

    if (files.length === 0) return true;

    const expectedPlatformToken = process.platform === 'darwin' ? '-mac-' : '-win-';
    return files.some((file) => {
      const candidate = file.url || file.path || '';
      const fileName = fileNameFromUrl(candidate);
      return fileName.includes(expectedPlatformToken) && fileName.includes(`-${runtimeArch}.`);
    });
  }

  private async checkForUpdatesViaInstallerMetadata(): Promise<UpdateInfo | null> {
    const artifactUrl = this.getManualArtifactUrl();
    if (!artifactUrl) {
      this.updateStatus({
        status: 'error',
        error: `Manual update is not supported on ${process.platform}-${process.arch}`,
      });
      return null;
    }

    const response = await fetch(artifactUrl, { method: 'HEAD', cache: 'no-store' });
    if (!response.ok) {
      if (response.status === 404) {
        this.manualDownloadUrl = null;
        this.updateStatus({ status: 'not-available' });
        return null;
      }
      throw new Error(`Failed to request installer metadata: ${response.status} ${response.statusText}`);
    }

    const latestVersion = response.headers.get('x-oss-meta-version')?.trim();
    if (!latestVersion) {
      throw new Error(
        `Missing x-oss-meta-version header on ${artifactUrl}. CI must set object metadata for installer files.`
      );
    }

    const releaseDate = response.headers.get('x-oss-meta-release-date') || response.headers.get('last-modified');
    const releaseNotes = response.headers.get('x-oss-meta-release-notes') || null;
    const currentVersion = app.getVersion();

    if (compareSemverLike(latestVersion, currentVersion) > 0) {
      this.manualDownloadUrl = artifactUrl;
      const info: UpdateInfo = {
        version: latestVersion,
        releaseDate: releaseDate || undefined,
        releaseNotes,
      };
      this.updateStatus({ status: 'available', info });
      return info;
    }

    this.manualDownloadUrl = null;
    this.updateStatus({ status: 'not-available' });
    return null;
  }

  /**
   * Setup auto-updater event listeners
   */
  private setupListeners(): void {
    autoUpdater.on('checking-for-update', () => {
      this.updateStatus({ status: 'checking' });
      this.emit('checking-for-update');
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.updateStatus({ status: 'available', info });
      this.emit('update-available', info);
    });

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.updateStatus({ status: 'not-available', info });
      this.emit('update-not-available', info);
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.updateStatus({ status: 'downloading', progress });
      this.emit('download-progress', progress);
    });

    autoUpdater.on('update-downloaded', (event: UpdateDownloadedEvent) => {
      this.updateStatus({ status: 'downloaded', info: event });
      this.emit('update-downloaded', event);

      if (autoUpdater.autoDownload) {
        this.startAutoInstallCountdown();
      }
    });

    autoUpdater.on('error', (error: Error) => {
      if (this.isMissingUpdaterMetadataError(error)) {
        // Expected when OSS only publishes installers without latest-*.yml.
        // checkForUpdates() will fallback to installer metadata mode.
        logger.warn('[Updater] Ignore latest-*.yml 404 error event; using installer metadata fallback');
        return;
      }
      this.updateStatus({ status: 'error', error: error.message });
      this.emit('error', error);
    });
  }

  /**
   * Update status and notify renderer
   */
  private updateStatus(newStatus: Partial<UpdateStatus>): void {
    this.status = {
      status: newStatus.status ?? this.status.status,
      info: newStatus.info,
      progress: newStatus.progress,
      error: newStatus.error,
    };
    this.sendToRenderer('update:status-changed', this.status);
  }

  /**
   * Send event to renderer process
   */
  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * Check for updates.
   * Checks against the runtime feed URL for the resolved OSS update channel.
   *
   * In dev mode (not packed), autoUpdater.checkForUpdates() silently returns
   * null without emitting any events, so we must detect this and force a
   * final status so the UI never gets stuck in 'checking'.
   */
  async checkForUpdates(): Promise<UpdateInfo | null> {
    this.manualDownloadUrl = null;
    this.updateStatus({ status: 'checking', error: undefined });

    try {
      const result = await autoUpdater.checkForUpdates();

      // In dev mode (app not packaged), autoUpdater silently returns null
      // without emitting ANY events (not even checking-for-update).
      // Detect this and force an error so the UI never stays silent.
      if (result == null) {
        return await this.checkForUpdatesViaInstallerMetadata();
      }

      const updateInfo = result.updateInfo || null;
      if (updateInfo && !this.hasMatchingArchInUpdateInfo(updateInfo)) {
        logger.warn(
          `[Updater] Update metadata has no matching file for runtime arch ${process.arch}; fallback to installer metadata mode`
        );
        return await this.checkForUpdatesViaInstallerMetadata();
      }

      // Safety net: if events somehow didn't fire, force a final state.
      if (this.status.status === 'checking' || this.status.status === 'idle') {
        this.updateStatus({ status: 'not-available' });
      }

      return updateInfo;
    } catch (error) {
      if (this.isMissingUpdaterMetadataError(error)) {
        logger.warn('[Updater] Missing latest-*.yml metadata, fallback to installer metadata mode');
        return await this.checkForUpdatesViaInstallerMetadata();
      }

      logger.error('[Updater] Check for updates failed:', error);
      this.updateStatus({ status: 'error', error: (error as Error).message || String(error) });
      throw error;
    }
  }

  /**
   * Download available update
   */
  async downloadUpdate(): Promise<void> {
    if (this.manualDownloadUrl) {
      try {
        await shell.openExternal(this.manualDownloadUrl);
        this.updateStatus({ status: 'downloaded', info: this.status.info });
        return;
      } catch (error) {
        logger.error('[Updater] Open installer URL failed:', error);
        throw error;
      }
    }

    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      logger.error('[Updater] Download update failed:', error);
      throw error;
    }
  }

  /**
   * Install update and restart.
   *
   * On macOS, electron-updater delegates to Squirrel.Mac (ShipIt). The
   * native quitAndInstall() spawns ShipIt then internally calls app.quit().
   * However, the tray close handler in index.ts intercepts window close
   * and hides to tray unless isQuitting is true. Squirrel's internal quit
   * sometimes fails to trigger before-quit in time, so we set isQuitting
   * BEFORE calling quitAndInstall(). This lets the native quit flow close
   * the window cleanly while ShipIt runs independently to replace the app.
   */
  quitAndInstall(): void {
    if (this.manualDownloadUrl) {
      shell.openExternal(this.manualDownloadUrl).catch((error) => {
        logger.error('[Updater] Open installer URL for install failed:', error);
      });
      return;
    }

    logger.info('[Updater] quitAndInstall called');
    setQuitting();
    autoUpdater.quitAndInstall();
  }

  /**
   * Start a countdown that auto-installs the downloaded update.
   * Sends `update:auto-install-countdown` events to the renderer each second.
   */
  private startAutoInstallCountdown(): void {
    this.clearAutoInstallTimer();
    this.autoInstallCountdown = AppUpdater.AUTO_INSTALL_DELAY_SECONDS;
    this.sendToRenderer('update:auto-install-countdown', { seconds: this.autoInstallCountdown });

    this.autoInstallTimer = setInterval(() => {
      this.autoInstallCountdown--;
      this.sendToRenderer('update:auto-install-countdown', { seconds: this.autoInstallCountdown });

      if (this.autoInstallCountdown <= 0) {
        this.clearAutoInstallTimer();
        this.quitAndInstall();
      }
    }, 1000);
  }

  cancelAutoInstall(): void {
    this.clearAutoInstallTimer();
    this.sendToRenderer('update:auto-install-countdown', { seconds: -1, cancelled: true });
  }

  private clearAutoInstallTimer(): void {
    if (this.autoInstallTimer) {
      clearInterval(this.autoInstallTimer);
      this.autoInstallTimer = null;
    }
  }

  /**
   * Set update channel (stable, beta, dev)
   */
  setChannel(channel: 'stable' | 'beta' | 'dev'): void {
    this.activeChannel = resolveChannelFromPreference(channel);
    this.manualDownloadUrl = null;
    this.applyFeedConfig();
  }

  /**
   * Set auto-download preference
   */
  setAutoDownload(enable: boolean): void {
    autoUpdater.autoDownload = enable;
  }

  /**
   * Get current version
   */
  getCurrentVersion(): string {
    return app.getVersion();
  }
}

/**
 * Register IPC handlers for update operations
 */
export function registerUpdateHandlers(
  updater: AppUpdater,
  mainWindow: BrowserWindow
): void {
  updater.setMainWindow(mainWindow);

  // Get current update status
  ipcMain.handle('update:status', () => {
    return updater.getStatus();
  });

  // Get current version
  ipcMain.handle('update:version', () => {
    return updater.getCurrentVersion();
  });

  // Check for updates – always return final status so the renderer
  // never gets stuck in 'checking' waiting for a push event.
  ipcMain.handle('update:check', async () => {
    try {
      await updater.checkForUpdates();
      return { success: true, status: updater.getStatus() };
    } catch (error) {
      return { success: false, error: String(error), status: updater.getStatus() };
    }
  });

  // Download update
  ipcMain.handle('update:download', async () => {
    try {
      await updater.downloadUpdate();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Install update and restart
  ipcMain.handle('update:install', () => {
    updater.quitAndInstall();
    return { success: true };
  });

  // Set update channel
  ipcMain.handle('update:setChannel', (_, channel: 'stable' | 'beta' | 'dev') => {
    updater.setChannel(channel);
    return { success: true };
  });

  // Set auto-download preference
  ipcMain.handle('update:setAutoDownload', (_, enable: boolean) => {
    updater.setAutoDownload(enable);
    return { success: true };
  });

  // Cancel pending auto-install countdown
  ipcMain.handle('update:cancelAutoInstall', () => {
    updater.cancelAutoInstall();
    return { success: true };
  });

}

// Export singleton instance
export const appUpdater = new AppUpdater();
