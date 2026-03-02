/**
 * IPC Handlers
 * Registers all IPC handlers for main-renderer communication
 */
import { ipcMain, BrowserWindow, shell, dialog, app, nativeImage } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, extname, basename } from 'node:path';
import crypto from 'node:crypto';
import { GatewayManager } from '../gateway/manager';
import { ClawHubService, ClawHubSearchParams, ClawHubInstallParams, ClawHubUninstallParams } from '../gateway/clawhub';
import {
  storeApiKey,
  getApiKey,
  deleteApiKey,
  hasApiKey,
  saveProvider,
  getProvider,
  deleteProvider,
  setDefaultProvider,
  getDefaultProvider,
  getAllProvidersWithKeyInfo,
  type ProviderConfig,
} from '../utils/secure-storage';
import {
  getOpenClawStatus,
  getOpenClawDir,
  getOpenClawConfigDir,
  getOpenClawSkillsDir,
  getResourcesDir,
  ensureDir,
} from '../utils/paths';
import { getOpenClawCliCommand } from '../utils/openclaw-cli';
import { getSetting, setSetting } from '../utils/store';
import {
  saveProviderKeyToOpenClaw,
  removeProviderKeyFromOpenClaw,
  removeProviderFromOpenClaw,
  setOpenClawAgentModel,
  setOpenClawAgentModelWithOverride,
  syncProviderConfigToOpenClaw,
  updateAgentModelProvider,
} from '../utils/openclaw-auth';
import { logger } from '../utils/logger';
import {
  saveChannelConfig,
  getChannelConfig,
  getChannelFormValues,
  deleteChannelConfig,
  listConfiguredChannels,
  setChannelEnabled,
  validateChannelConfig,
  validateChannelCredentials,
  enforceLawClawChannelBinding,
  clearLawClawChannelBinding,
} from '../utils/channel-config';
import { checkUvInstalled, installUv, setupManagedPython } from '../utils/uv-setup';
import { updateSkillConfig, getSkillConfig, getAllSkillConfigs } from '../utils/skill-config';
import { whatsAppLoginManager } from '../utils/whatsapp-login';
import { getProviderConfig, getProviderEnvVar } from '../utils/provider-registry';
import { validateApiKeyWithProvider } from '../utils/provider-validation';
import { applyOpenClawConfigEnvFallbacks } from '../utils/openclaw-config-env';
import {
  detectPluginInstallationState,
  clearPluginChannelConfigBackup,
  isAlreadyInstalledErrorMessage,
  readPluginChannelConfigBackup,
  restorePluginChannelConfigAfterInstall,
  savePluginChannelConfigBackup,
  sanitizePluginPackageManifestForLocalInstall,
  stripPluginChannelConfigForInstall,
} from '../utils/openclaw-plugin-install';
import { forceSetup } from './index';
import {
  getAgentPresetMigrationArtifactsDir,
  getAgentPresetMigrationStatus,
  onAgentPresetMigrationChatLock,
  onAgentPresetMigrationStatus,
  resolveAgentPresetMigrationConflict,
  retryAgentPresetMigrationNow,
} from '../utils/agent-preset-migration';
import {
  filterLawClawSessions,
  normalizeLawClawSessionKey,
  normalizeSessionKeyParam,
} from '../utils/lawclaw-session';
import { deviceOAuthManager, OAuthProviderType } from '../utils/device-oauth';

const LAWCLAW_MAIN_AGENT_ID = 'lawclaw-main';

/**
 * For custom/ollama providers, derive a unique key for OpenClaw config files
 * so that multiple instances of the same type don't overwrite each other.
 * For all other providers the key is simply the provider type.
 */
export function getOpenClawProviderKey(type: string, providerId: string): string {
  if (type === 'custom' || type === 'ollama') {
    const suffix = providerId.replace(/-/g, '').slice(0, 8);
    return `${type}-${suffix}`;
  }
  if (type === 'minimax-portal-cn') {
    return 'minimax-portal';
  }
  return type;
}

function normalizeChannelType(channelType: string): string {
  return channelType.trim().toLowerCase();
}

async function getLawClawManagedChannels(): Promise<string[]> {
  const value = await getSetting('lawclawManagedChannels');
  if (!Array.isArray(value)) {
    return [];
  }

  const channels = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const normalized = normalizeChannelType(item);
    if (normalized) {
      channels.add(normalized);
    }
  }
  return Array.from(channels);
}

/**
 * Register all IPC handlers
 */
export function registerIpcHandlers(
  gatewayManager: GatewayManager,
  clawHubService: ClawHubService,
  jurismindHubService: ClawHubService,
  mainWindow: BrowserWindow
): void {
  // Gateway handlers
  registerGatewayHandlers(gatewayManager, mainWindow);

  // Skills marketplace handlers
  registerMarketplaceHandlers('clawhub', clawHubService);
  registerMarketplaceHandlers('jurismindhub', jurismindHubService);

  // OpenClaw handlers
  registerOpenClawHandlers(gatewayManager);

  // Provider handlers
  registerProviderHandlers(gatewayManager);

  // Shell handlers
  registerShellHandlers();

  // Dialog handlers
  registerDialogHandlers();

  // App handlers
  registerAppHandlers();

  // UV handlers
  registerUvHandlers();

  // Log handlers (for UI to read gateway/app logs)
  registerLogHandlers();

  // Skill config handlers (direct file access, no Gateway RPC)
  registerSkillConfigHandlers();

  // Cron task handlers (proxy to Gateway RPC)
  registerCronHandlers(gatewayManager);

  // Window control handlers (for custom title bar on Windows/Linux)
  registerWindowHandlers(mainWindow);

  // WhatsApp handlers
  registerWhatsAppHandlers(mainWindow);

  // Device OAuth handlers (Code Plan)
  registerDeviceOAuthHandlers(mainWindow);

  // File staging handlers (upload/send separation)
  registerFileHandlers();

  // Agent preset migration handlers
  registerAgentPresetMigrationHandlers(mainWindow);
}

/**
 * Skill config IPC handlers
 * Direct read/write to ~/.openclaw/openclaw.json (bypasses Gateway RPC)
 */
function registerSkillConfigHandlers(): void {
  // Update skill config (apiKey and env)
  ipcMain.handle('skill:updateConfig', async (_, params: {
    skillKey: string;
    apiKey?: string;
    env?: Record<string, string>;
  }) => {
    return await updateSkillConfig(params.skillKey, {
      apiKey: params.apiKey,
      env: params.env,
    });
  });

  // Get skill config
  ipcMain.handle('skill:getConfig', async (_, skillKey: string) => {
    return await getSkillConfig(skillKey);
  });

  // Get all skill configs
  ipcMain.handle('skill:getAllConfigs', async () => {
    return await getAllSkillConfigs();
  });
}

/**
 * Gateway CronJob type (as returned by cron.list RPC)
 */
interface GatewayCronJob {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: { kind: string; expr?: string; everyMs?: number; at?: string; tz?: string };
  payload: { kind: string; message?: string; text?: string };
  delivery?: { mode: string; channel?: string; to?: string };
  sessionTarget?: string;
  state: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: string;
    lastError?: string;
    lastDurationMs?: number;
  };
}

/**
 * Transform a Gateway CronJob to the frontend CronJob format
 */
function transformCronJob(job: GatewayCronJob) {
  // Extract message from payload
  const message = job.payload?.message || job.payload?.text || '';

  // Build target from delivery info — only if a delivery channel is specified
  const channelType = job.delivery?.channel;
  const target = channelType
    ? { channelType, channelId: channelType, channelName: channelType }
    : undefined;

  // Build lastRun from state
  const lastRun = job.state?.lastRunAtMs
    ? {
      time: new Date(job.state.lastRunAtMs).toISOString(),
      success: job.state.lastStatus === 'ok',
      error: job.state.lastError,
      duration: job.state.lastDurationMs,
    }
    : undefined;

  // Build nextRun from state
  const nextRun = job.state?.nextRunAtMs
    ? new Date(job.state.nextRunAtMs).toISOString()
    : undefined;

  return {
    id: job.id,
    name: job.name,
    message,
    schedule: job.schedule, // Pass the object through; frontend parseCronSchedule handles it
    target,
    enabled: job.enabled,
    createdAt: new Date(job.createdAtMs).toISOString(),
    updatedAt: new Date(job.updatedAtMs).toISOString(),
    lastRun,
    nextRun,
  };
}

/**
 * Cron task IPC handlers
 * Proxies cron operations to the Gateway RPC service.
 * The frontend works with plain cron expression strings, but the Gateway
 * expects CronSchedule objects ({ kind: "cron", expr: "..." }).
 * These handlers bridge the two formats.
 */
function registerCronHandlers(gatewayManager: GatewayManager): void {
  // List all cron jobs — transforms Gateway CronJob format to frontend CronJob format
  ipcMain.handle('cron:list', async () => {
    try {
      const result = await gatewayManager.rpc('cron.list', { includeDisabled: true });
      const data = result as { jobs?: GatewayCronJob[] };
      const jobs = data?.jobs ?? [];

      // Auto-repair legacy UI-created jobs that were saved without
      // delivery: { mode: 'none' }.  The Gateway auto-normalizes them
      // to delivery: { mode: 'announce' } which then fails with
      // "Channel is required" when no external channels are configured.
      for (const job of jobs) {
        const isIsolatedAgent =
          (job.sessionTarget === 'isolated' || !job.sessionTarget) &&
          job.payload?.kind === 'agentTurn';
        const needsRepair =
          isIsolatedAgent &&
          job.delivery?.mode === 'announce' &&
          !job.delivery?.channel;

        if (needsRepair) {
          try {
            await gatewayManager.rpc('cron.update', {
              id: job.id,
              patch: { delivery: { mode: 'none' } },
            });
            job.delivery = { mode: 'none' };
            // Clear stale channel-resolution error from the last run
            if (job.state?.lastError?.includes('Channel is required')) {
              job.state.lastError = undefined;
              job.state.lastStatus = 'ok';
            }
          } catch (e) {
            console.warn(`Failed to auto-repair cron job ${job.id}:`, e);
          }
        }
      }

      // Transform Gateway format to frontend format
      return jobs.map(transformCronJob);
    } catch (error) {
      console.error('Failed to list cron jobs:', error);
      throw error;
    }
  });

  // Create a new cron job
  // UI-created tasks have no delivery target — results go to the ClawX chat page.
  // Tasks created via external channels (Feishu, Discord, etc.) are handled
  // directly by the OpenClaw Gateway and do not pass through this IPC handler.
  ipcMain.handle('cron:create', async (_, input: {
    name: string;
    message: string;
    schedule: string;
    enabled?: boolean;
  }) => {
    try {
      const gatewayInput = {
        name: input.name,
        schedule: { kind: 'cron', expr: input.schedule },
        payload: { kind: 'agentTurn', message: input.message },
        enabled: input.enabled ?? true,
        wakeMode: 'next-heartbeat',
        sessionTarget: 'isolated',
        // UI-created jobs deliver results via ClawX WebSocket chat events,
        // not external messaging channels.  Setting mode='none' prevents
        // the Gateway from attempting channel delivery (which would fail
        // with "Channel is required" when no channels are configured).
        delivery: { mode: 'none' },
      };
      const result = await gatewayManager.rpc('cron.add', gatewayInput);
      // Transform the returned job to frontend format
      if (result && typeof result === 'object') {
        return transformCronJob(result as GatewayCronJob);
      }
      return result;
    } catch (error) {
      console.error('Failed to create cron job:', error);
      throw error;
    }
  });

  // Update an existing cron job
  ipcMain.handle('cron:update', async (_, id: string, input: Record<string, unknown>) => {
    try {
      // Transform schedule string to CronSchedule object if present
      const patch = { ...input };
      if (typeof patch.schedule === 'string') {
        patch.schedule = { kind: 'cron', expr: patch.schedule };
      }
      // Transform message to payload format if present
      if (typeof patch.message === 'string') {
        patch.payload = { kind: 'agentTurn', message: patch.message };
        delete patch.message;
      }
      const result = await gatewayManager.rpc('cron.update', { id, patch });
      return result;
    } catch (error) {
      console.error('Failed to update cron job:', error);
      throw error;
    }
  });

  // Delete a cron job
  ipcMain.handle('cron:delete', async (_, id: string) => {
    try {
      const result = await gatewayManager.rpc('cron.remove', { id });
      return result;
    } catch (error) {
      console.error('Failed to delete cron job:', error);
      throw error;
    }
  });

  // Toggle a cron job enabled/disabled
  ipcMain.handle('cron:toggle', async (_, id: string, enabled: boolean) => {
    try {
      const result = await gatewayManager.rpc('cron.update', { id, patch: { enabled } });
      return result;
    } catch (error) {
      console.error('Failed to toggle cron job:', error);
      throw error;
    }
  });

  // Trigger a cron job manually
  ipcMain.handle('cron:trigger', async (_, id: string) => {
    try {
      const result = await gatewayManager.rpc('cron.run', { id, mode: 'force' });
      return result;
    } catch (error) {
      console.error('Failed to trigger cron job:', error);
      throw error;
    }
  });
}

/**
 * UV-related IPC handlers
 */
function registerUvHandlers(): void {
  // Check if uv is installed
  ipcMain.handle('uv:check', async () => {
    return await checkUvInstalled();
  });

  // Install uv and setup managed Python
  ipcMain.handle('uv:install-all', async () => {
    try {
      const isInstalled = await checkUvInstalled();
      if (!isInstalled) {
        await installUv();
      }
      // Always run python setup to ensure it exists in uv's cache
      await setupManagedPython();
      return { success: true };
    } catch (error) {
      console.error('Failed to setup uv/python:', error);
      return { success: false, error: String(error) };
    }
  });
}

/**
 * Log-related IPC handlers
 * Allows the renderer to read application logs for diagnostics
 */
function registerLogHandlers(): void {
  // Get recent logs from memory ring buffer
  ipcMain.handle('log:getRecent', async (_, count?: number) => {
    return logger.getRecentLogs(count);
  });

  // Read log file content (last N lines)
  ipcMain.handle('log:readFile', async (_, tailLines?: number) => {
    return await logger.readLogFile(tailLines);
  });

  // Get log file path (so user can open in file explorer)
  ipcMain.handle('log:getFilePath', async () => {
    return logger.getLogFilePath();
  });

  // Get log directory path
  ipcMain.handle('log:getDir', async () => {
    return logger.getLogDir();
  });

  // List all log files
  ipcMain.handle('log:listFiles', async () => {
    return await logger.listLogFiles();
  });
}

/**
 * Gateway-related IPC handlers
 */
function registerGatewayHandlers(
  gatewayManager: GatewayManager,
  mainWindow: BrowserWindow
): void {
  // Get Gateway status
  ipcMain.handle('gateway:status', () => {
    return gatewayManager.getStatus();
  });

  // Check if Gateway is connected
  ipcMain.handle('gateway:isConnected', () => {
    return gatewayManager.isConnected();
  });

  // Start Gateway
  ipcMain.handle('gateway:start', async () => {
    try {
      await gatewayManager.start();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Stop Gateway
  ipcMain.handle('gateway:stop', async () => {
    try {
      await gatewayManager.stop();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Restart Gateway
  ipcMain.handle('gateway:restart', async () => {
    try {
      await gatewayManager.restart();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Gateway RPC call
  ipcMain.handle('gateway:rpc', async (_, method: string, params?: unknown, timeoutMs?: number) => {
    try {
      const normalizedParams = normalizeSessionKeyParam(params);
      const result = await gatewayManager.rpc(method, normalizedParams, timeoutMs);
      const finalResult = method === 'sessions.list' ? filterLawClawSessions(result) : result;
      return { success: true, result: finalResult };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Chat send with media — reads staged files from disk and builds attachments.
  // Raster images (png/jpg/gif/webp) are inlined as base64 vision attachments.
  // All other files are referenced by path in the message text so the model
  // can access them via tools (the same format channels use).
  const VISION_MIME_TYPES = new Set([
    'image/png', 'image/jpeg', 'image/bmp', 'image/webp',
  ]);

  ipcMain.handle('chat:sendWithMedia', async (_, params: {
    sessionKey: string;
    message: string;
    deliver?: boolean;
    idempotencyKey: string;
    media?: Array<{ filePath: string; mimeType: string; fileName: string }>;
  }) => {
    try {
      const normalizedSessionKey = normalizeLawClawSessionKey(params.sessionKey);
      let message = params.message;
      // The Gateway processes image attachments through TWO parallel paths:
      // Path A: `attachments` param → parsed via `parseMessageWithAttachments` →
      //   injected as inline vision content when the model supports images.
      //   Format: { content: base64, mimeType: string, fileName?: string }
      // Path B: `[media attached: ...]` in message text → Gateway's native image
      //   detection (`detectAndLoadPromptImages`) reads the file from disk and
      //   injects it as inline vision content. Also works for history messages.
      // We use BOTH paths for maximum reliability.
      const imageAttachments: Array<Record<string, unknown>> = [];
      const fileReferences: string[] = [];

      if (params.media && params.media.length > 0) {
        const fsP = await import('fs/promises');
        for (const m of params.media) {
          const exists = await fsP.access(m.filePath).then(() => true, () => false);
          logger.info(`[chat:sendWithMedia] Processing file: ${m.fileName} (${m.mimeType}), path: ${m.filePath}, exists: ${exists}, isVision: ${VISION_MIME_TYPES.has(m.mimeType)}`);

          // Always add file path reference so the model can access it via tools
          fileReferences.push(
            `[media attached: ${m.filePath} (${m.mimeType}) | ${m.filePath}]`,
          );

          if (VISION_MIME_TYPES.has(m.mimeType)) {
            // Send as base64 attachment in the format the Gateway expects:
            // { content: base64String, mimeType: string, fileName?: string }
            // The Gateway normalizer looks for `a.content` (NOT `a.source.data`).
            const fileBuffer = await fsP.readFile(m.filePath);
            const base64Data = fileBuffer.toString('base64');
            logger.info(`[chat:sendWithMedia] Read ${fileBuffer.length} bytes, base64 length: ${base64Data.length}`);
            imageAttachments.push({
              content: base64Data,
              mimeType: m.mimeType,
              fileName: m.fileName,
            });
          }
        }
      }

      // Append file references to message text so the model knows about them
      if (fileReferences.length > 0) {
        const refs = fileReferences.join('\n');
        message = message ? `${message}\n\n${refs}` : refs;
      }

      const rpcParams: Record<string, unknown> = {
        sessionKey: normalizedSessionKey,
        message,
        deliver: params.deliver ?? false,
        idempotencyKey: params.idempotencyKey,
      };

      if (imageAttachments.length > 0) {
        rpcParams.attachments = imageAttachments;
      }

      logger.info(`[chat:sendWithMedia] Sending: message="${message.substring(0, 100)}", attachments=${imageAttachments.length}, fileRefs=${fileReferences.length}`);

      // Use a longer timeout when images are present (120s vs default 30s)
      const timeoutMs = imageAttachments.length > 0 ? 120000 : 30000;
      const result = await gatewayManager.rpc('chat.send', rpcParams, timeoutMs);
      logger.info(`[chat:sendWithMedia] RPC result: ${JSON.stringify(result)}`);
      return { success: true, result };
    } catch (error) {
      logger.error(`[chat:sendWithMedia] Error: ${String(error)}`);
      return { success: false, error: String(error) };
    }
  });

  // Get the Control UI URL with token for embedding
  ipcMain.handle('gateway:getControlUiUrl', async () => {
    try {
      const status = gatewayManager.getStatus();
      const token = await getSetting('gatewayToken');
      const port = status.port || 18789;
      // Pass token as query param - Control UI will store it in localStorage
      const url = `http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`;
      return { success: true, url, port, token };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Health check
  ipcMain.handle('gateway:health', async () => {
    try {
      const health = await gatewayManager.checkHealth();
      return { success: true, ...health };
    } catch (error) {
      return { success: false, ok: false, error: String(error) };
    }
  });

  // Forward Gateway events to renderer
  gatewayManager.on('status', (status) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gateway:status-changed', status);
    }
  });

  gatewayManager.on('message', (message) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gateway:message', message);
    }
  });

  gatewayManager.on('notification', (notification) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gateway:notification', notification);
    }
  });

  gatewayManager.on('channel:status', (data) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gateway:channel-status', data);
    }
  });

  gatewayManager.on('chat:message', (data) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gateway:chat-message', data);
    }
  });

  gatewayManager.on('exit', (code) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gateway:exit', code);
    }
  });

  gatewayManager.on('error', (error) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gateway:error', error.message);
    }
  });
}

export function registerAgentPresetMigrationHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('agentPresetMigration:getStatus', () => {
    return getAgentPresetMigrationStatus();
  });

  ipcMain.handle('agentPresetMigration:getArtifactsDir', () => {
    return getAgentPresetMigrationArtifactsDir();
  });

  ipcMain.handle('agentPresetMigration:resolveConflict', async (_, decision: string) => {
    if (
      decision !== 'preserve_user' &&
      decision !== 'prefer_preset' &&
      decision !== 'skip_this_time'
    ) {
      return {
        success: false,
        message: `invalid conflict decision: ${decision}`,
      };
    }
    return resolveAgentPresetMigrationConflict(
      decision as 'preserve_user' | 'prefer_preset' | 'skip_this_time'
    );
  });

  ipcMain.handle('agentPresetMigration:retryNow', async () => {
    await retryAgentPresetMigrationNow();
    return { success: true };
  });

  onAgentPresetMigrationStatus((status) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agentPresetMigration:statusChanged', status);
    }
  });

  onAgentPresetMigrationChatLock((locked) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agentPresetMigration:chatLockChanged', { locked });
    }
  });
}

/**
 * OpenClaw-related IPC handlers
 * For checking package status and channel configuration
 */
function registerOpenClawHandlers(): void {
  const QQ_PLUGIN_ID = 'qqbot';
  const QQ_PLUGIN_VERSION = '1.5.0';
  const QQ_PLUGIN_NPM_SPEC = `@sliverp/${QQ_PLUGIN_ID}@${QQ_PLUGIN_VERSION}`;

  const runOpenClawCli = async (args: string[]): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    error?: string;
  }> => {
    try {
      const status = getOpenClawStatus();
      if (!status.packageExists || !existsSync(status.entryPath)) {
        return {
          success: false,
          stdout: '',
          stderr: '',
          error: `OpenClaw entry script not found at: ${status.entryPath}`,
        };
      }

      const openclawConfigDir = getOpenClawConfigDir();
      ensureDir(openclawConfigDir);

      let cliEnv: NodeJS.ProcessEnv = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
      };
      try {
        const configPath = join(openclawConfigDir, 'openclaw.json');
        if (existsSync(configPath)) {
          const configRaw = readFileSync(configPath, 'utf-8');
          cliEnv = applyOpenClawConfigEnvFallbacks(configRaw, cliEnv);
        }
      } catch (error) {
        logger.warn('Failed to apply OpenClaw config env fallbacks for CLI execution', error);
      }

      return await new Promise((resolve) => {
        const child = spawn(process.execPath, [status.entryPath, ...args], {
          cwd: openclawConfigDir,
          env: cliEnv,
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('error', (error) => {
          resolve({
            success: false,
            stdout,
            stderr,
            error: String(error),
          });
        });

        child.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true, stdout, stderr });
            return;
          }
          resolve({
            success: false,
            stdout,
            stderr,
            error: stderr.trim() || stdout.trim() || `openclaw exited with code ${String(code)}`,
          });
        });
      });
    } catch (error) {
      return {
        success: false,
        stdout: '',
        stderr: '',
        error: String(error),
      };
    }
  };

  const runCommand = async (
    command: string,
    args: string[],
    cwd: string,
    useShell: boolean
  ): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    error?: string;
  }> => {
    return await new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd,
        shell: useShell,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          stdout,
          stderr,
          error: String(error),
        });
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, stdout, stderr });
          return;
        }
        resolve({
          success: false,
          stdout,
          stderr,
          error: stderr.trim() || stdout.trim() || `${command} exited with code ${String(code)}`,
        });
      });
    });
  };

  const prepareQqbotLocalInstallDir = async (): Promise<{
    success: boolean;
    tempDir?: string;
    installPath?: string;
    error?: string;
    details?: string;
  }> => {
    const tempDir = mkdtempSync(join(tmpdir(), 'clawx-qqbot-install-'));
    const extractDir = join(tempDir, 'extract');
    mkdirSync(extractDir, { recursive: true });

    try {
      let archivePath = join(
        getResourcesDir(),
        'plugins',
        QQ_PLUGIN_ID,
        `qqbot-${QQ_PLUGIN_VERSION}.tgz`
      );

      if (!existsSync(archivePath)) {
        if (app.isPackaged) {
          return {
            success: false,
            error: `Bundled plugin package not found: ${archivePath}`,
          };
        }

        const packResult = await runCommand(
          'npm',
          ['pack', QQ_PLUGIN_NPM_SPEC, '--silent'],
          tempDir,
          true
        );
        if (!packResult.success) {
          return {
            success: false,
            error: packResult.error || 'Failed to download QQ plugin package',
            details: packResult.stderr || packResult.stdout,
          };
        }

        const packedName = packResult.stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .pop();

        if (!packedName) {
          return {
            success: false,
            error: 'npm pack completed but returned no archive filename',
            details: packResult.stdout,
          };
        }

        archivePath = join(tempDir, packedName);
      }

      // Keep tar execution shell-free so archive paths with spaces are handled safely.
      const extractResult = await runCommand('tar', ['-xzf', archivePath, '-C', extractDir], tempDir, false);
      if (!extractResult.success) {
        return {
          success: false,
          error: extractResult.error || 'Failed to extract QQ plugin archive',
          details: extractResult.stderr || extractResult.stdout,
        };
      }

      const installPath = join(extractDir, 'package');
      sanitizePluginPackageManifestForLocalInstall(installPath);

      return {
        success: true,
        tempDir,
        installPath,
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  };

  const detectPluginInstalled = (
    pluginId: string
  ): { installed: boolean; source?: 'extensions' | 'plugins.installs' | 'plugins.load.paths' } => {
    const openclawConfigDir = getOpenClawConfigDir();
    const pluginDir = join(openclawConfigDir, 'extensions', pluginId);
    const configPath = join(openclawConfigDir, 'openclaw.json');

    let parsedConfig: Record<string, unknown> | undefined;
    if (existsSync(configPath)) {
      try {
        const raw = readFileSync(configPath, 'utf-8');
        parsedConfig = JSON.parse(raw) as Record<string, unknown>;
      } catch (error) {
        logger.warn('Failed to parse OpenClaw config while detecting plugin installation state', error);
      }
    }

    return detectPluginInstallationState(pluginId, {
      hasExtensionDir: existsSync(pluginDir),
      config: parsedConfig,
    });
  };

  // Get OpenClaw package status
  ipcMain.handle('openclaw:status', () => {
    const status = getOpenClawStatus();
    logger.info('openclaw:status IPC called', status);
    return status;
  });

  // Check if OpenClaw is ready (package present)
  ipcMain.handle('openclaw:isReady', () => {
    const status = getOpenClawStatus();
    return status.packageExists;
  });

  // Get the resolved OpenClaw directory path (for diagnostics)
  ipcMain.handle('openclaw:getDir', () => {
    return getOpenClawDir();
  });

  // Get the OpenClaw config directory (~/.openclaw)
  ipcMain.handle('openclaw:getConfigDir', () => {
    return getOpenClawConfigDir();
  });

  // Get the OpenClaw skills directory (~/.openclaw/skills)
  ipcMain.handle('openclaw:getSkillsDir', () => {
    const dir = getOpenClawSkillsDir();
    ensureDir(dir);
    return dir;
  });

  // Get a shell command to run OpenClaw CLI without modifying PATH
  ipcMain.handle('openclaw:getCliCommand', () => {
    try {
      const status = getOpenClawStatus();
      if (!status.packageExists) {
        return { success: false, error: `OpenClaw package not found at: ${status.dir}` };
      }
      if (!existsSync(status.entryPath)) {
        return { success: false, error: `OpenClaw entry script not found at: ${status.entryPath}` };
      }
      return { success: true, command: getOpenClawCliCommand() };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });


  // Check whether a plugin is installed in ~/.openclaw/extensions/<pluginId>
  ipcMain.handle('openclaw:isPluginInstalled', async (_, pluginId: string) => {
    try {
      if (!pluginId || typeof pluginId !== 'string') {
        return { success: false, installed: false, error: 'Invalid plugin ID' };
      }
      const detection = detectPluginInstalled(pluginId);
      return { success: true, installed: detection.installed, source: detection.source };
    } catch (error) {
      return { success: false, installed: false, error: String(error) };
    }
  });

  // Install a bundled plugin tarball from resources/plugins/<pluginId>/
  ipcMain.handle('openclaw:installBundledPlugin', async (_, pluginId: string) => {
    const openclawConfigDir = getOpenClawConfigDir();
    const configPath = join(openclawConfigDir, 'openclaw.json');
    let strippedChannelConfig: Record<string, unknown> | undefined;
    let tempInstallDir: string | undefined;
    let shouldRestoreChannelConfig = false;

    const restoreChannelConfigAfterInstall = (): void => {
      try {
        if (!existsSync(configPath)) {
          return;
        }

        const backupConfig = readPluginChannelConfigBackup(openclawConfigDir, pluginId);
        const channelConfigToRestore = strippedChannelConfig ?? backupConfig;
        if (!channelConfigToRestore) {
          clearPluginChannelConfigBackup(openclawConfigDir, pluginId);
          return;
        }

        const raw = readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const restored = restorePluginChannelConfigAfterInstall(
          parsed,
          pluginId,
          channelConfigToRestore
        );
        writeFileSync(configPath, JSON.stringify(restored, null, 2), 'utf-8');
        clearPluginChannelConfigBackup(openclawConfigDir, pluginId);
      } catch (error) {
        logger.warn('Failed to restore plugin channel config after install', error);
      }
    };

    try {
      if (pluginId !== QQ_PLUGIN_ID) {
        return { success: false, error: `Unsupported bundled plugin: ${pluginId}` };
      }
      shouldRestoreChannelConfig =
        readPluginChannelConfigBackup(openclawConfigDir, pluginId) !== undefined;

      logger.info('openclaw:installBundledPlugin requested', { pluginId });

      const detectionBeforeInstall = detectPluginInstalled(pluginId);
      if (detectionBeforeInstall.installed) {
        logger.info('openclaw:installBundledPlugin skipped because plugin is already installed', {
          pluginId,
          source: detectionBeforeInstall.source,
        });
        return {
          success: true,
          installed: true,
          skipped: true,
          reason: 'already-installed',
          source: detectionBeforeInstall.source,
        };
      }

      const prepared = await prepareQqbotLocalInstallDir();
      if (!prepared.success || !prepared.installPath || !prepared.tempDir) {
        return {
          success: false,
          error: prepared.error || 'Failed to prepare QQ plugin package',
          details: prepared.details,
        };
      }
      tempInstallDir = prepared.tempDir;

      if (existsSync(configPath)) {
        try {
          const raw = readFileSync(configPath, 'utf-8');
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          const stripped = stripPluginChannelConfigForInstall(parsed, pluginId);
          strippedChannelConfig = stripped.removedChannelConfig;

          if (strippedChannelConfig) {
            writeFileSync(configPath, JSON.stringify(stripped.config, null, 2), 'utf-8');
            savePluginChannelConfigBackup(openclawConfigDir, pluginId, strippedChannelConfig);
            shouldRestoreChannelConfig = true;
          }
        } catch (error) {
          logger.warn('Failed to strip plugin channel config before install', error);
        }
      }

      const installResult = await runOpenClawCli(['plugins', 'install', prepared.installPath]);
      if (!installResult.success) {
        const installErrorText = [
          installResult.error,
          installResult.stderr,
          installResult.stdout,
        ]
          .filter((item): item is string => typeof item === 'string' && item.length > 0)
          .join('\n');

        if (isAlreadyInstalledErrorMessage(installErrorText)) {
          const detectionAfterFailedInstall = detectPluginInstalled(pluginId);
          if (detectionAfterFailedInstall.installed) {
            logger.warn(
              'openclaw:installBundledPlugin detected already-installed response and converted to skip success',
              {
                pluginId,
                source: detectionAfterFailedInstall.source,
              }
            );
            return {
              success: true,
              installed: true,
              skipped: true,
              reason: 'already-installed',
              source: detectionAfterFailedInstall.source,
            };
          }
        }

        return {
          success: false,
          error: installResult.error || 'Failed to install bundled plugin',
          details: installResult.stderr || installResult.stdout,
        };
      }

      const detectionAfterInstall = detectPluginInstalled(pluginId);
      if (!detectionAfterInstall.installed) {
        return {
          success: false,
          error: 'Plugin install command finished but install state could not be detected',
          details: installResult.stdout,
        };
      }

      logger.info('openclaw:installBundledPlugin completed successfully', {
        pluginId,
        source: detectionAfterInstall.source,
      });
      return { success: true, installed: true, source: detectionAfterInstall.source };
    } catch (error) {
      return { success: false, error: String(error) };
    } finally {
      if (shouldRestoreChannelConfig) {
        restoreChannelConfigAfterInstall();
      }
      if (tempInstallDir) {
        rmSync(tempInstallDir, { recursive: true, force: true });
      }
    }
  });

  // ==================== Channel Configuration Handlers ====================

  // Save channel configuration
  ipcMain.handle('channel:saveConfig', async (_, channelType: string, config: Record<string, unknown>) => {
    try {
      logger.info('channel:saveConfig', { channelType, keys: Object.keys(config || {}) });
      await saveChannelConfig(channelType, config);

      const normalizedChannelType = normalizeChannelType(channelType);
      if (normalizedChannelType) {
        const managedChannels = await getLawClawManagedChannels();
        if (!managedChannels.includes(normalizedChannelType)) {
          managedChannels.push(normalizedChannelType);
          await setSetting('lawclawManagedChannels', managedChannels);
        }
        await enforceLawClawChannelBinding(normalizedChannelType);
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to save channel config:', error);
      return { success: false, error: String(error) };
    }
  });

  // Get channel configuration
  ipcMain.handle('channel:getConfig', async (_, channelType: string) => {
    try {
      const config = await getChannelConfig(channelType);
      return { success: true, config };
    } catch (error) {
      console.error('Failed to get channel config:', error);
      return { success: false, error: String(error) };
    }
  });

  // Get channel form values (reverse-transformed for UI pre-fill)
  ipcMain.handle('channel:getFormValues', async (_, channelType: string) => {
    try {
      const values = await getChannelFormValues(channelType);
      return { success: true, values };
    } catch (error) {
      console.error('Failed to get channel form values:', error);
      return { success: false, error: String(error) };
    }
  });

  // Delete channel configuration
  ipcMain.handle('channel:deleteConfig', async (_, channelType: string) => {
    try {
      await deleteChannelConfig(channelType);

      const normalizedChannelType = normalizeChannelType(channelType);
      if (normalizedChannelType) {
        const managedChannels = await getLawClawManagedChannels();
        if (managedChannels.includes(normalizedChannelType)) {
          await clearLawClawChannelBinding(normalizedChannelType);
          await setSetting(
            'lawclawManagedChannels',
            managedChannels.filter((item) => item !== normalizedChannelType)
          );
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to delete channel config:', error);
      return { success: false, error: String(error) };
    }
  });

  // List configured channels
  ipcMain.handle('channel:listConfigured', async () => {
    try {
      const channels = await listConfiguredChannels();
      return { success: true, channels };
    } catch (error) {
      console.error('Failed to list channels:', error);
      return { success: false, error: String(error) };
    }
  });

  // Enable or disable a channel
  ipcMain.handle('channel:setEnabled', async (_, channelType: string, enabled: boolean) => {
    try {
      await setChannelEnabled(channelType, enabled);
      return { success: true };
    } catch (error) {
      console.error('Failed to set channel enabled:', error);
      return { success: false, error: String(error) };
    }
  });

  // Validate channel configuration
  ipcMain.handle('channel:validate', async (_, channelType: string) => {
    try {
      const result = await validateChannelConfig(channelType);
      return { success: true, ...result };
    } catch (error) {
      console.error('Failed to validate channel:', error);
      return { success: false, valid: false, errors: [String(error)], warnings: [] };
    }
  });

  // Validate channel credentials by calling actual service APIs (before saving)
  ipcMain.handle('channel:validateCredentials', async (_, channelType: string, config: Record<string, string>) => {
    try {
      const result = await validateChannelCredentials(channelType, config);
      return { success: true, ...result };
    } catch (error) {
      console.error('Failed to validate channel credentials:', error);
      return { success: false, valid: false, errors: [String(error)], warnings: [] };
    }
  });
}

/**
 * WhatsApp Login Handlers
 */
function registerWhatsAppHandlers(mainWindow: BrowserWindow): void {
  // Request WhatsApp QR code
  ipcMain.handle('channel:requestWhatsAppQr', async (_, accountId: string) => {
    try {
      logger.info('channel:requestWhatsAppQr', { accountId });
      await whatsAppLoginManager.start(accountId);
      return { success: true };
    } catch (error) {
      logger.error('channel:requestWhatsAppQr failed', error);
      return { success: false, error: String(error) };
    }
  });

  // Cancel WhatsApp login
  ipcMain.handle('channel:cancelWhatsAppQr', async () => {
    try {
      await whatsAppLoginManager.stop();
      return { success: true };
    } catch (error) {
      logger.error('channel:cancelWhatsAppQr failed', error);
      return { success: false, error: String(error) };
    }
  });

  // Check WhatsApp status (is it active?)
  // ipcMain.handle('channel:checkWhatsAppStatus', ...)

  // Forward events to renderer
  whatsAppLoginManager.on('qr', (data) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('channel:whatsapp-qr', data);
    }
  });

  whatsAppLoginManager.on('success', (data) => {
    if (!mainWindow.isDestroyed()) {
      logger.info('whatsapp:login-success', data);
      mainWindow.webContents.send('channel:whatsapp-success', data);
    }
  });

  whatsAppLoginManager.on('error', (error) => {
    if (!mainWindow.isDestroyed()) {
      logger.error('whatsapp:login-error', error);
      mainWindow.webContents.send('channel:whatsapp-error', error);
    }
  });
}

/**
 * Device OAuth Handlers (Code Plan)
 */
function registerDeviceOAuthHandlers(mainWindow: BrowserWindow): void {
  deviceOAuthManager.setWindow(mainWindow);

  // Request Provider OAuth initialization
  ipcMain.handle('provider:requestOAuth', async (_, provider: OAuthProviderType, region?: 'global' | 'cn') => {
    try {
      logger.info(`provider:requestOAuth for ${provider}`);
      await deviceOAuthManager.startFlow(provider, region);
      return { success: true };
    } catch (error) {
      logger.error('provider:requestOAuth failed', error);
      return { success: false, error: String(error) };
    }
  });

  // Cancel Provider OAuth
  ipcMain.handle('provider:cancelOAuth', async () => {
    try {
      await deviceOAuthManager.stopFlow();
      return { success: true };
    } catch (error) {
      logger.error('provider:cancelOAuth failed', error);
      return { success: false, error: String(error) };
    }
  });
}

/**
 * Provider-related IPC handlers
 */
function registerProviderHandlers(gatewayManager: GatewayManager): void {
  const saveProviderKeyToOpenClawAgents = (providerType: string, apiKey: string): void => {
    saveProviderKeyToOpenClaw(providerType, apiKey);
    saveProviderKeyToOpenClaw(providerType, apiKey, LAWCLAW_MAIN_AGENT_ID);
  };

  const removeProviderKeyFromOpenClawAgents = (providerType: string): void => {
    removeProviderKeyFromOpenClaw(providerType);
    removeProviderKeyFromOpenClaw(providerType, LAWCLAW_MAIN_AGENT_ID);
  };

  // Get all providers with key info
  ipcMain.handle('provider:list', async () => {
    return await getAllProvidersWithKeyInfo();
  });

  // Get a specific provider
  ipcMain.handle('provider:get', async (_, providerId: string) => {
    return await getProvider(providerId);
  });

  // Save a provider configuration
  ipcMain.handle('provider:save', async (_, config: ProviderConfig, apiKey?: string) => {
    try {
      // Save the provider config
      await saveProvider(config);

      // Derive the unique OpenClaw key for this provider instance
      const ock = getOpenClawProviderKey(config.type, config.id);

      // Store the API key if provided
      if (apiKey !== undefined) {
        const trimmedKey = apiKey.trim();
        if (trimmedKey) {
          await storeApiKey(config.id, trimmedKey);

          // Also write to OpenClaw auth-profiles.json so the gateway can use it
          try {
            saveProviderKeyToOpenClawAgents(ock, trimmedKey);
          } catch (err) {
            console.warn('Failed to save key to OpenClaw auth-profiles:', err);
          }
        }
      }

      // Sync the provider configuration to openclaw.json so Gateway knows about it
      try {
        const meta = getProviderConfig(config.type);
        const api = config.type === 'custom' || config.type === 'ollama' ? 'openai-completions' : meta?.api;

        if (api) {
          await syncProviderConfigToOpenClaw(ock, config.model, {
            baseUrl: config.baseUrl || meta?.baseUrl,
            api,
            apiKeyEnv: meta?.apiKeyEnv,
            headers: meta?.headers,
          });

          if (config.type === 'custom' || config.type === 'ollama') {
            const resolvedKey = apiKey !== undefined
              ? (apiKey.trim() || null)
              : await getApiKey(config.id);
            if (resolvedKey && config.baseUrl) {
              const modelId = config.model;
              await updateAgentModelProvider(ock, {
                baseUrl: config.baseUrl,
                api: 'openai-completions',
                models: modelId ? [{ id: modelId, name: modelId }] : [],
                apiKey: resolvedKey,
              });
            }
          }

          // Debounced restart so the gateway picks up new config/env vars.
          // Multiple rapid provider saves (e.g. during setup) are coalesced.
          logger.info(`Scheduling Gateway restart after saving provider "${ock}" config`);
          gatewayManager.debouncedRestart();
        }
      } catch (err) {
        console.warn('Failed to sync openclaw provider config:', err);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Delete a provider
  ipcMain.handle('provider:delete', async (_, providerId: string) => {
    try {
      const existing = await getProvider(providerId);
      await deleteProvider(providerId);

      // Best-effort cleanup in OpenClaw auth profiles & openclaw.json config
      if (existing?.type) {
        try {
          const ock = getOpenClawProviderKey(existing.type, providerId);
          await removeProviderFromOpenClaw(ock);

          // Debounced restart so the gateway stops loading the deleted provider.
          logger.info(`Scheduling Gateway restart after deleting provider "${ock}"`);
          gatewayManager.debouncedRestart();
        } catch (err) {
          console.warn('Failed to completely remove provider from OpenClaw:', err);
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Update API key for a provider
  ipcMain.handle('provider:setApiKey', async (_, providerId: string, apiKey: string) => {
    try {
      await storeApiKey(providerId, apiKey);

      // Also write to OpenClaw auth-profiles.json
      const provider = await getProvider(providerId);
      const providerType = provider?.type || providerId;
      const ock = getOpenClawProviderKey(providerType, providerId);
      try {
        saveProviderKeyToOpenClawAgents(ock, apiKey);
      } catch (err) {
        console.warn('Failed to save key to OpenClaw auth-profiles:', err);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Atomically update provider config and API key
  ipcMain.handle(
    'provider:updateWithKey',
    async (
      _,
      providerId: string,
      updates: Partial<ProviderConfig>,
      apiKey?: string
    ) => {
      const existing = await getProvider(providerId);
      if (!existing) {
        return { success: false, error: 'Provider not found' };
      }

      const previousKey = await getApiKey(providerId);
      const previousOck = getOpenClawProviderKey(existing.type, providerId);

      try {
        const nextConfig: ProviderConfig = {
          ...existing,
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        const ock = getOpenClawProviderKey(nextConfig.type, providerId);

        await saveProvider(nextConfig);

        if (apiKey !== undefined) {
          const trimmedKey = apiKey.trim();
          if (trimmedKey) {
            await storeApiKey(providerId, trimmedKey);
            saveProviderKeyToOpenClawAgents(ock, trimmedKey);
          } else {
            await deleteApiKey(providerId);
            removeProviderKeyFromOpenClawAgents(ock);
          }
        }

        // Sync the provider configuration to openclaw.json so Gateway knows about it
        try {
          const meta = getProviderConfig(nextConfig.type);
          const api = nextConfig.type === 'custom' || nextConfig.type === 'ollama' ? 'openai-completions' : meta?.api;

          if (api) {
            await syncProviderConfigToOpenClaw(ock, nextConfig.model, {
              baseUrl: nextConfig.baseUrl || meta?.baseUrl,
              api,
              apiKeyEnv: meta?.apiKeyEnv,
              headers: meta?.headers,
            });

            if (nextConfig.type === 'custom' || nextConfig.type === 'ollama') {
              const resolvedKey = apiKey !== undefined
                ? (apiKey.trim() || null)
                : await getApiKey(providerId);
              if (resolvedKey && nextConfig.baseUrl) {
                const modelId = nextConfig.model;
                await updateAgentModelProvider(ock, {
                  baseUrl: nextConfig.baseUrl,
                  api: 'openai-completions',
                  models: modelId ? [{ id: modelId, name: modelId }] : [],
                  apiKey: resolvedKey,
                });
              }
            }
          }

          // If this provider is the current default, update the primary model
          const defaultProviderId = await getDefaultProvider();
          if (defaultProviderId === providerId) {
            const modelOverride =
              nextConfig.type === 'moonshot_code_plan'
                ? undefined
                : (nextConfig.model
                  ? (nextConfig.model.startsWith(`${ock}/`) ? nextConfig.model : `${ock}/${nextConfig.model}`)
                  : undefined);

            const registryProviderConfig = getProviderConfig(nextConfig.type);
            const shouldUseRuntimeOverride = nextConfig.type === 'custom' || nextConfig.type === 'ollama';

            if (shouldUseRuntimeOverride) {
              setOpenClawAgentModelWithOverride(LAWCLAW_MAIN_AGENT_ID, ock, modelOverride, {
                baseUrl: nextConfig.baseUrl,
                api: registryProviderConfig?.api || 'openai-completions',
                apiKeyEnv: getProviderEnvVar(nextConfig.type),
                headers: registryProviderConfig?.headers,
              });
            } else {
              setOpenClawAgentModel(LAWCLAW_MAIN_AGENT_ID, ock, modelOverride);
            }
          }

          // Debounced restart so the gateway picks up updated config/env vars.
          logger.info(`Scheduling Gateway restart after updating provider "${ock}" config`);
          gatewayManager.debouncedRestart();
        } catch (err) {
          console.warn('Failed to sync openclaw config after provider update:', err);
        }

        return { success: true };
      } catch (error) {
        // Best-effort rollback to keep config/key consistent.
        try {
          await saveProvider(existing);
          if (previousKey) {
            await storeApiKey(providerId, previousKey);
            saveProviderKeyToOpenClawAgents(previousOck, previousKey);
          } else {
            await deleteApiKey(providerId);
            removeProviderKeyFromOpenClawAgents(previousOck);
          }
        } catch (rollbackError) {
          console.warn('Failed to rollback provider updateWithKey:', rollbackError);
        }

        return { success: false, error: String(error) };
      }
    }
  );

  // Delete API key for a provider
  ipcMain.handle('provider:deleteApiKey', async (_, providerId: string) => {
    try {
      await deleteApiKey(providerId);

      // Keep OpenClaw auth-profiles.json in sync with local key storage
      const provider = await getProvider(providerId);
      const providerType = provider?.type || providerId;
      const ock = getOpenClawProviderKey(providerType, providerId);
      try {
        removeProviderKeyFromOpenClawAgents(ock);
      } catch (err) {
        console.warn('Failed to completely remove provider from OpenClaw:', err);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Check if a provider has an API key
  ipcMain.handle('provider:hasApiKey', async (_, providerId: string) => {
    return await hasApiKey(providerId);
  });

  // Get the actual API key (for internal use only - be careful!)
  ipcMain.handle('provider:getApiKey', async (_, providerId: string) => {
    return await getApiKey(providerId);
  });

  // Set default provider and update LawClaw dedicated agent model
  ipcMain.handle('provider:setDefault', async (_, providerId: string) => {
    try {
      await setDefaultProvider(providerId);

      // Update OpenClaw config to use this provider's model for lawclaw-main only.
      const provider = await getProvider(providerId);
      if (provider) {
        try {
          const ock = getOpenClawProviderKey(provider.type, providerId);
          // moonshot_code_plan is pinned to official kimi-coding/k2p5.
          const modelOverride =
            provider.type === 'moonshot_code_plan'
              ? undefined
              : (provider.model
                ? (provider.model.startsWith(`${ock}/`) ? provider.model : `${ock}/${provider.model}`)
                : undefined);

          const registryProviderConfig = getProviderConfig(provider.type);
          const shouldUseRuntimeOverride = provider.type === 'custom' || provider.type === 'ollama';

          if (shouldUseRuntimeOverride) {
            // For runtime-configured providers, use user-entered base URL/api.
            setOpenClawAgentModelWithOverride(LAWCLAW_MAIN_AGENT_ID, ock, modelOverride, {
              baseUrl: provider.baseUrl,
              api: registryProviderConfig?.api || 'openai-completions',
              apiKeyEnv: getProviderEnvVar(provider.type),
            });
          } else {
            setOpenClawAgentModel(LAWCLAW_MAIN_AGENT_ID, ock, modelOverride);
          }

          // Keep auth-profiles in sync with the default provider instance.
          // This is especially important when multiple custom providers exist.
          const providerKey = await getApiKey(providerId);
          if (providerKey) {
            saveProviderKeyToOpenClawAgents(ock, providerKey);
          }

          // Restart Gateway so it picks up the new config and env vars.
          // OpenClaw reads openclaw.json per-request, but env vars (API keys)
          // are only available if they were injected at process startup.
          if (gatewayManager.isConnected()) {
            logger.info(`Scheduling Gateway restart after provider switch to "${ock}"`);
            gatewayManager.debouncedRestart();
          }
        } catch (err) {
          console.warn('Failed to set OpenClaw agent model:', err);
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });



  // Get default provider
  ipcMain.handle('provider:getDefault', async () => {
    return await getDefaultProvider();
  });

  // Validate API key by making a real test request to the provider.
  // providerId can be either a stored provider ID or a provider type.
  ipcMain.handle(
    'provider:validateKey',
    async (
      _,
      providerId: string,
      apiKey: string,
      options?: { baseUrl?: string }
    ) => {
      try {
        // First try to get existing provider
        const provider = await getProvider(providerId);

        // Use provider.type if provider exists, otherwise use providerId as the type
        // This allows validation during setup when provider hasn't been saved yet
        const providerType = provider?.type || providerId;
        const registryBaseUrl = getProviderConfig(providerType)?.baseUrl;
        // Prefer caller-supplied baseUrl (live form value), then registry default.
        // This avoids stale persisted baseUrl (e.g. missing /v1) causing false negatives.
        const resolvedBaseUrl = options?.baseUrl || registryBaseUrl || provider?.baseUrl;

        console.log(`[clawx-validate] validating provider type: ${providerType}`);
        return await validateApiKeyWithProvider(providerType, apiKey, { baseUrl: resolvedBaseUrl });
      } catch (error) {
        console.error('Validation error:', error);
        return { valid: false, error: String(error) };
      }
    }
  );
}

/**
 * Shell-related IPC handlers
 */
function registerShellHandlers(): void {
  // Open external URL
  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    await shell.openExternal(url);
  });

  // Open path in file explorer
  ipcMain.handle('shell:showItemInFolder', async (_, path: string) => {
    shell.showItemInFolder(path);
  });

  // Open path
  ipcMain.handle('shell:openPath', async (_, path: string) => {
    return await shell.openPath(path);
  });
}

type SkillsMarketChannel = 'clawhub' | 'jurismindhub';

/**
 * Skills marketplace IPC handlers (ClawHub / JurismindHub)
 */
function registerMarketplaceHandlers(channelPrefix: SkillsMarketChannel, service: ClawHubService): void {
  // Search skills
  ipcMain.handle(`${channelPrefix}:search`, async (_, params: ClawHubSearchParams) => {
    try {
      const results = await service.search(params);
      return { success: true, results };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Install skill
  ipcMain.handle(`${channelPrefix}:install`, async (_, params: ClawHubInstallParams) => {
    try {
      await service.install(params);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Uninstall skill
  ipcMain.handle(`${channelPrefix}:uninstall`, async (_, params: ClawHubUninstallParams) => {
    try {
      await service.uninstall(params);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // List installed skills
  ipcMain.handle(`${channelPrefix}:list`, async () => {
    try {
      const results = await service.listInstalled();
      return { success: true, results };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Open skill readme
  ipcMain.handle(`${channelPrefix}:openSkillReadme`, async (_, slug: string) => {
    try {
      await service.openSkillReadme(slug);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Open skill page in external browser
  ipcMain.handle(`${channelPrefix}:openSkillPage`, async (_, slug: string) => {
    try {
      await service.openSkillPage(slug);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
}

/**
 * Dialog-related IPC handlers
 */
function registerDialogHandlers(): void {
  // Show open dialog
  ipcMain.handle('dialog:open', async (_, options: Electron.OpenDialogOptions) => {
    const result = await dialog.showOpenDialog(options);
    return result;
  });

  // Show save dialog
  ipcMain.handle('dialog:save', async (_, options: Electron.SaveDialogOptions) => {
    const result = await dialog.showSaveDialog(options);
    return result;
  });

  // Show message box
  ipcMain.handle('dialog:message', async (_, options: Electron.MessageBoxOptions) => {
    const result = await dialog.showMessageBox(options);
    return result;
  });
}

/**
 * App-related IPC handlers
 */
function registerAppHandlers(): void {
  // Get app version
  ipcMain.handle('app:version', () => {
    return app.getVersion();
  });

  // Get app name
  ipcMain.handle('app:name', () => {
    return app.getName();
  });

  // Get app path
  ipcMain.handle('app:getPath', (_, name: Parameters<typeof app.getPath>[0]) => {
    return app.getPath(name);
  });

  // Get platform
  ipcMain.handle('app:platform', () => {
    return process.platform;
  });

  // Quit app
  ipcMain.handle('app:quit', () => {
    app.quit();
  });

  // Relaunch app
  ipcMain.handle('app:relaunch', () => {
    app.relaunch();
    app.quit();
  });

  // Check if force-setup mode is enabled
  ipcMain.handle('app:forceSetup', () => {
    return forceSetup;
  });
}

/**
 * Window control handlers (for custom title bar on Windows/Linux)
 */
function registerWindowHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('window:minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.handle('window:close', () => {
    mainWindow.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow.isMaximized();
  });
}

// ── Mime type helpers ────────────────────────────────────────────

const EXT_MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.7z': 'application/x-7z-compressed',
  '.rar': 'application/vnd.rar',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.py': 'text/x-python',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function getMimeType(ext: string): string {
  return EXT_MIME_MAP[ext.toLowerCase()] || 'application/octet-stream';
}

function mimeToExt(mimeType: string): string {
  for (const [ext, mime] of Object.entries(EXT_MIME_MAP)) {
    if (mime === mimeType) return ext;
  }
  return '';
}

const OUTBOUND_DIR = join(homedir(), '.openclaw', 'media', 'outbound');

/**
 * Generate a preview data URL for image files.
 * Resizes large images while preserving aspect ratio (only constrain the
 * longer side so the image is never squished). The frontend handles
 * square cropping via CSS object-fit: cover.
 */
async function generateImagePreview(filePath: string, mimeType: string): Promise<string | null> {
  try {
    const img = nativeImage.createFromPath(filePath);
    if (img.isEmpty()) return null;
    const size = img.getSize();
    const maxDim = 512; // keep enough resolution for crisp display on Retina
    // Only resize if larger than threshold — specify ONE dimension to keep ratio
    if (size.width > maxDim || size.height > maxDim) {
      const resized = size.width >= size.height
        ? img.resize({ width: maxDim })   // landscape / square → constrain width
        : img.resize({ height: maxDim }); // portrait → constrain height
      return `data:image/png;base64,${resized.toPNG().toString('base64')}`;
    }
    // Small image — use original (async read to avoid blocking)
    const { readFile: readFileAsync } = await import('fs/promises');
    const buf = await readFileAsync(filePath);
    return `data:${mimeType};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * File staging IPC handlers
 * Stage files to ~/.openclaw/media/outbound/ for gateway access
 */
function registerFileHandlers(): void {
  // Stage files from real disk paths (used with dialog:open)
  ipcMain.handle('file:stage', async (_, filePaths: string[]) => {
    const fsP = await import('fs/promises');
    await fsP.mkdir(OUTBOUND_DIR, { recursive: true });

    const results = [];
    for (const filePath of filePaths) {
      const id = crypto.randomUUID();
      const ext = extname(filePath);
      const stagedPath = join(OUTBOUND_DIR, `${id}${ext}`);
      await fsP.copyFile(filePath, stagedPath);

      const s = await fsP.stat(stagedPath);
      const mimeType = getMimeType(ext);
      const fileName = basename(filePath);

      // Generate preview for images
      let preview: string | null = null;
      if (mimeType.startsWith('image/')) {
        preview = await generateImagePreview(stagedPath, mimeType);
      }

      results.push({ id, fileName, mimeType, fileSize: s.size, stagedPath, preview });
    }
    return results;
  });

  // Stage file from buffer (used for clipboard paste / drag-drop)
  ipcMain.handle('file:stageBuffer', async (_, payload: {
    base64: string;
    fileName: string;
    mimeType: string;
  }) => {
    const fsP = await import('fs/promises');
    await fsP.mkdir(OUTBOUND_DIR, { recursive: true });

    const id = crypto.randomUUID();
    const ext = extname(payload.fileName) || mimeToExt(payload.mimeType);
    const stagedPath = join(OUTBOUND_DIR, `${id}${ext}`);
    const buffer = Buffer.from(payload.base64, 'base64');
    await fsP.writeFile(stagedPath, buffer);

    const mimeType = payload.mimeType || getMimeType(ext);
    const fileSize = buffer.length;

    // Generate preview for images
    let preview: string | null = null;
    if (mimeType.startsWith('image/')) {
      preview = await generateImagePreview(stagedPath, mimeType);
    }

    return { id, fileName: payload.fileName, mimeType, fileSize, stagedPath, preview };
  });

  // Load thumbnails for file paths on disk (used to restore previews in history)
  // Save an image to a user-chosen location (base64 data URI or existing file path)
  ipcMain.handle('media:saveImage', async (_, params: {
    base64?: string;
    mimeType?: string;
    filePath?: string;
    defaultFileName: string;
  }) => {
    try {
      const ext = params.defaultFileName.includes('.')
        ? params.defaultFileName.split('.').pop()!
        : (params.mimeType?.split('/')[1] || 'png');
      const result = await dialog.showSaveDialog({
        defaultPath: join(homedir(), 'Downloads', params.defaultFileName),
        filters: [
          { name: 'Images', extensions: [ext, 'png', 'jpg', 'jpeg', 'webp', 'gif'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (result.canceled || !result.filePath) return { success: false };

      const fsP = await import('fs/promises');
      if (params.filePath) {
        try {
          await fsP.access(params.filePath);
          await fsP.copyFile(params.filePath, result.filePath);
        } catch {
          return { success: false, error: 'Source file not found' };
        }
      } else if (params.base64) {
        const buffer = Buffer.from(params.base64, 'base64');
        await fsP.writeFile(result.filePath, buffer);
      } else {
        return { success: false, error: 'No image data provided' };
      }
      return { success: true, savedPath: result.filePath };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('media:getThumbnails', async (_, paths: Array<{ filePath: string; mimeType: string }>) => {
    const fsP = await import('fs/promises');
    const results: Record<string, { preview: string | null; fileSize: number }> = {};
    for (const { filePath, mimeType } of paths) {
      try {
        const s = await fsP.stat(filePath);
        let preview: string | null = null;
        if (mimeType.startsWith('image/')) {
          preview = await generateImagePreview(filePath, mimeType);
        }
        results[filePath] = { preview, fileSize: s.size };
      } catch {
        results[filePath] = { preview: null, fileSize: 0 };
      }
    }
    return results;
  });
}
