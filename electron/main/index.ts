/**
 * Electron Main Process Entry
 * Manages window creation, system tray, and IPC handlers
 */
import { app, BrowserWindow, nativeImage, session, shell } from 'electron';
import { join } from 'path';
import { GatewayManager } from '../gateway/manager';
import { registerIpcHandlers } from './ipc-handlers';
import { createTray } from './tray';
import { createMenu } from './menu';

import { appUpdater, registerUpdateHandlers } from './updater';
import { isQuitting, setQuitting } from './app-state';
import { logger } from '../utils/logger';
import { warmupNetworkOptimization } from '../utils/uv-env';
import { runProviderStartupMigration } from '../utils/provider-migration';
import { runAgentPresetStartupMigration } from '../utils/agent-preset-migration';
import { jurismindConnectorManager } from '../utils/jurismind-connector';
import { ensureMacUninstallWatcher } from '../utils/mac-uninstall-watcher';

import { ClawHubService } from '../gateway/clawhub';
import {
  CLAWHUB_REGISTRY_URL,
  CLAWHUB_SITE_URL,
  JURISMINDHUB_REGISTRY_URL,
  JURISMINDHUB_SITE_URL,
} from '../gateway/market-source';

// Disable GPU hardware acceleration globally for maximum stability across
// all GPU configurations (no GPU, integrated, discrete).
//
// Rationale (following VS Code's philosophy):
// - Page/file loading is async data fetching — zero GPU dependency.
// - The original per-platform GPU branching was added to avoid CPU rendering
//   competing with sync I/O on Windows, but all file I/O is now async
//   (fs/promises), so that concern no longer applies.
// - Software rendering is deterministic across all hardware; GPU compositing
//   behaviour varies between vendors (Intel, AMD, NVIDIA, Apple Silicon) and
//   driver versions, making it the #1 source of rendering bugs in Electron.
//
// Users who want GPU acceleration can pass `--enable-gpu` on the CLI or
// set `"disable-hardware-acceleration": false` in the app config (future).
app.disableHardwareAcceleration();

// Check for force-setup mode via command line argument or environment variable
const forceSetup = process.argv.includes('--force-setup') || process.env.FORCE_SETUP === 'true';
const forceLawclawAgentPreset =
  process.argv.includes('--force-lawclaw-agent-preset') || process.env.FORCE_LAWCLAW_AGENT_PRESET === 'true';

// Global references
let mainWindow: BrowserWindow | null = null;
const gatewayManager = new GatewayManager();
const clawHubService = new ClawHubService({
  market: 'clawhub',
  siteUrl: CLAWHUB_SITE_URL,
  registryUrl: CLAWHUB_REGISTRY_URL,
});
const jurismindHubService = new ClawHubService({
  market: 'jurismindhub',
  siteUrl: JURISMINDHUB_SITE_URL,
  registryUrl: JURISMINDHUB_REGISTRY_URL,
});

/**
 * Resolve the icons directory path (works in both dev and packaged mode)
 */
function getIconsDir(): string {
  if (app.isPackaged) {
    // Packaged: icons are in extraResources → process.resourcesPath/resources/icons
    return join(process.resourcesPath, 'resources', 'icons');
  }
  // Development: relative to dist-electron/main/
  return join(__dirname, '../../resources/icons');
}

/**
 * Get the app icon for the current platform
 */
function getAppIcon(): Electron.NativeImage | undefined {
  if (process.platform === 'darwin') return undefined; // macOS uses the app bundle icon

  const iconsDir = getIconsDir();
  const iconPath =
    process.platform === 'win32'
      ? join(iconsDir, 'icon.ico')
      : join(iconsDir, 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  return icon.isEmpty() ? undefined : icon;
}

/**
 * Create the main application window
 */
function createWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin';

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    icon: getAppIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true, // Enable <webview> for embedding OpenClaw Control UI
    },
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    frame: isMac,
    show: false,
  });

  // Show window when ready to prevent visual flash
  win.once('ready-to-show', () => {
    win.show();
  });

  // Handle external links
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(join(__dirname, '../../dist/index.html'));
  }

  return win;
}

/**
 * Initialize the application
 */
async function initialize(): Promise<void> {
  // Initialize logger first
  logger.init();
  logger.info('=== LawClaw Application Starting ===');
  logger.debug(
    `Runtime: platform=${process.platform}/${process.arch}, electron=${process.versions.electron}, node=${process.versions.node}, packaged=${app.isPackaged}`
  );

  // Warm up network optimization (non-blocking)
  void warmupNetworkOptimization();
  ensureMacUninstallWatcher();

  // Set application menu
  createMenu();

  // Create the main window
  mainWindow = createWindow();

  // Create system tray
  createTray(mainWindow);

  // Override security headers ONLY for the OpenClaw Gateway Control UI.
  // The URL filter ensures this callback only fires for gateway requests,
  // avoiding unnecessary overhead on every other HTTP response.
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['http://127.0.0.1:18789/*', 'http://localhost:18789/*'] },
    (details, callback) => {
      details.requestHeaders['HTTP-Referer'] = 'https://lawclaw.com';
      details.requestHeaders['X-Title'] = 'LawClaw';
      callback({ requestHeaders: details.requestHeaders });
    },
  );

  // Register IPC handlers
  registerIpcHandlers(gatewayManager, clawHubService, jurismindHubService, mainWindow);

  // Register update handlers
  registerUpdateHandlers(appUpdater, mainWindow);

  // Note: Auto-check for updates is driven by the renderer (update store init)
  // so it respects the user's "Auto-check for updates" setting.

  // Minimize to tray on close instead of quitting (macOS & Windows)
  mainWindow.on('close', (event) => {
    if (!isQuitting()) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Startup migration for legacy moonshot_code_plan -> official kimi-coding semantics.
  await runProviderStartupMigration();

  // Agent preset migration now runs before Gateway startup because upgrades are
  // deterministic local file comparisons and no longer depend on planner/LLM flows.
  await runAgentPresetStartupMigration({
    forceLawclawAgentPreset,
  });

  // Start Gateway automatically
  try {
    logger.debug('Auto-starting Gateway...');
    await gatewayManager.start();
    logger.info('Gateway auto-start succeeded');
  } catch (error) {
    logger.error('Gateway auto-start failed:', error);
    mainWindow?.webContents.send('gateway:error', String(error));
  }
}

// Application lifecycle
app.whenReady().then(() => {
  initialize();

  // Register activate handler AFTER app is ready to prevent
  // "Cannot create BrowserWindow before app is ready" on macOS.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      // On macOS, clicking the dock icon should show the window if it's hidden
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  setQuitting();
  // Fire-and-forget: do not await gatewayManager.stop() here.
  // Awaiting inside before-quit can stall Electron's quit sequence.
  void gatewayManager.stop().catch((err) => {
    logger.warn('gatewayManager.stop() error during quit:', err);
  });
  void jurismindConnectorManager.stop('app-before-quit').catch((err) => {
    logger.warn('jurismindConnectorManager.stop() error during quit:', err);
  });
});

// Export for testing
export { mainWindow, gatewayManager, forceSetup, forceLawclawAgentPreset };
