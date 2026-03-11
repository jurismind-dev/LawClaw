import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ensureDir, getOpenClawConfigDir, getOpenClawStatus } from './paths';
import { logger } from './logger';
import { applyOpenClawConfigEnvFallbacks } from './openclaw-config-env';
import {
  readOpenClawConfig,
  type OpenClawConfig,
  upsertLawClawChannelBinding,
  writeOpenClawConfig,
} from './channel-config';
import { detectPluginInstallationState } from './openclaw-plugin-install';
import { renderQrPngBase64 } from './qr-code';
import { finalizeFeishuOfficialPluginConfig } from './feishu-channel-defaults';
import { applyBundledNpmToCliEnv, getNodeExecForCli } from './openclaw-cli';

const FEISHU_REGISTRATION_URL = 'https://accounts.feishu.cn/oauth/v1/app/registration';
const FEISHU_OFFICIAL_PLUGIN_ID = 'feishu-openclaw-plugin';
const FEISHU_OFFICIAL_PLUGIN_PACKAGE = '@larksuite/openclaw-lark';
const FEISHU_CONFLICT_EXTENSION_DIR = 'feishu';

type FeishuOnboardingPhase =
  | 'idle'
  | 'installing'
  | 'waiting_scan'
  | 'polling'
  | 'configured'
  | 'error';

interface FeishuRegistrationInitResponse {
  supported_auth_methods?: string[];
}

interface FeishuRegistrationBeginResponse {
  verification_uri_complete?: string;
  device_code?: string;
  interval?: number;
  expire_in?: number;
}

interface FeishuRegistrationPollResponse {
  client_id?: string;
  client_secret?: string;
  error?: string;
  error_description?: string;
  user_info?: {
    open_id?: string;
  };
}

export interface FeishuOnboardingStatus {
  phase: FeishuOnboardingPhase;
  pluginInstalled: boolean;
  configured: boolean;
  pairUrl: string | null;
  pairQrCode: string | null;
  pairIssuedAt: number | null;
  expiresAt: number | null;
  lastError: string | null;
  lastMessage: string | null;
}

async function validateFeishuAppCredentials(appId: string, appSecret: string): Promise<boolean> {
  const cleanAppId = appId.trim();
  const cleanAppSecret = appSecret.trim();
  if (!cleanAppId || !cleanAppSecret) {
    return false;
  }

  try {
    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: cleanAppId,
        app_secret: cleanAppSecret,
      }),
    });

    const payload = await response.json().catch(() => null) as
      | { code?: number; tenant_access_token?: string }
      | null;

    return Boolean(response.ok && payload?.code === 0 && payload.tenant_access_token);
  } catch {
    return false;
  }
}

export interface FeishuOnboardingResult {
  pairUrl: string;
  pairQrCode: string | null;
  pairIssuedAt: number;
  expiresAt: number | null;
}

export interface FeishuOnboardingStartOptions {
  forceRefresh?: boolean;
  resetAuth?: boolean;
  reinstallPlugin?: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isConfiguredChannel(config: OpenClawConfig): boolean {
  const channel = config.channels?.feishu;
  return Boolean(
    channel
      && channel.enabled !== false
      && typeof channel.appId === 'string'
      && channel.appId.trim()
      && typeof channel.appSecret === 'string'
      && channel.appSecret.trim()
  );
}

async function postFeishuRegistrationForm<T>(
  body: Record<string, string>,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(FEISHU_REGISTRATION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
    signal,
  });

  const text = await response.text();
  if (!text.trim()) {
    throw new Error('飞书官方服务返回空响应');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`飞书官方服务返回了非 JSON 响应: ${String(error)}`);
  }

  return parsed as T;
}

class FeishuOnboardingManager extends EventEmitter {
  private status: FeishuOnboardingStatus = {
    phase: 'idle',
    pluginInstalled: false,
    configured: false,
    pairUrl: null,
    pairQrCode: null,
    pairIssuedAt: null,
    expiresAt: null,
    lastError: null,
    lastMessage: null,
  };

  private runToken = 0;
  private activeAbortController: AbortController | null = null;
  private activePollingPromise: Promise<void> | null = null;

  getStatus(): FeishuOnboardingStatus {
    return { ...this.status };
  }

  async refreshStatus(): Promise<FeishuOnboardingStatus> {
    const openclawConfigDir = getOpenClawConfigDir();
    const configPath = join(openclawConfigDir, 'openclaw.json');
    let parsedConfig: Record<string, unknown> | undefined;

    if (existsSync(configPath)) {
      try {
        parsedConfig = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      } catch (error) {
        logger.warn('[FeishuOnboarding] Failed to parse OpenClaw config while refreshing state', error);
      }
    }

    const pluginDir = join(openclawConfigDir, 'extensions', FEISHU_OFFICIAL_PLUGIN_ID);
    const pluginInstalled = detectPluginInstallationState(FEISHU_OFFICIAL_PLUGIN_ID, {
      hasExtensionDir: existsSync(pluginDir),
      config: parsedConfig,
    }).installed;

    const config = await readOpenClawConfig();
    const configured = isConfiguredChannel(config);
    const nextPhase =
      this.status.phase === 'installing' || this.status.phase === 'waiting_scan' || this.status.phase === 'polling'
        ? this.status.phase
        : configured
          ? 'configured'
          : 'idle';

    this.status = {
      ...this.status,
      phase: nextPhase,
      pluginInstalled,
      configured,
      lastError: configured ? null : this.status.lastError,
    };

    return this.getStatus();
  }

  async startPairing(options: FeishuOnboardingStartOptions = {}): Promise<FeishuOnboardingResult> {
    const forceRefresh = options.forceRefresh === true || options.resetAuth === true;
    const reinstallPlugin = options.reinstallPlugin === true;

    await this.refreshStatus();

    if (
      !forceRefresh
      && (this.status.phase === 'waiting_scan' || this.status.phase === 'polling')
      && this.status.pairUrl
      && this.status.pairIssuedAt
      && (!this.status.expiresAt || Date.now() < this.status.expiresAt)
    ) {
      return {
        pairUrl: this.status.pairUrl,
        pairQrCode: this.status.pairQrCode,
        pairIssuedAt: this.status.pairIssuedAt,
        expiresAt: this.status.expiresAt,
      };
    }

    if (forceRefresh) {
      this.cancelActiveFlow();
    }

    const currentRunToken = ++this.runToken;
    try {
      this.setStatus({
        phase: 'installing',
        lastError: null,
        lastMessage: '正在准备飞书官方插件...',
        pairUrl: null,
        pairQrCode: null,
        pairIssuedAt: null,
        expiresAt: null,
      });

      await this.ensureOfficialPluginInstalled(reinstallPlugin || forceRefresh);
      this.ensureRunIsCurrent(currentRunToken);

      const initResponse = await postFeishuRegistrationForm<FeishuRegistrationInitResponse>({
        action: 'init',
      });

      const methods = Array.isArray(initResponse.supported_auth_methods)
        ? initResponse.supported_auth_methods
        : [];
      if (!methods.includes('client_secret')) {
        throw new Error('当前飞书官方服务不支持 client_secret 模式，无法继续自动建机器人');
      }

      const beginResponse = await postFeishuRegistrationForm<FeishuRegistrationBeginResponse>({
        action: 'begin',
        archetype: 'PersonalAgent',
        auth_method: 'client_secret',
        request_user_info: 'open_id',
      });
      this.ensureRunIsCurrent(currentRunToken);

      const pairUrl = String(beginResponse.verification_uri_complete || '').trim();
      const deviceCode = String(beginResponse.device_code || '').trim();
      if (!pairUrl || !deviceCode) {
        throw new Error('飞书官方服务未返回可扫码的机器人创建链接');
      }

      const pairQrCode = renderQrPngBase64(pairUrl);
      const pairIssuedAt = Date.now();
      const expiresAt = Number.isFinite(beginResponse.expire_in)
        ? pairIssuedAt + Math.max(0, Number(beginResponse.expire_in)) * 1000
        : null;

      this.setStatus({
        phase: 'waiting_scan',
        pairUrl,
        pairQrCode: pairQrCode ? `data:image/png;base64,${pairQrCode}` : null,
        pairIssuedAt,
        expiresAt,
        lastError: null,
        lastMessage: '请使用飞书扫码创建机器人',
      });

      this.emit('pair-url', {
        pairUrl: this.status.pairUrl,
        pairQrCode: this.status.pairQrCode,
        pairIssuedAt: this.status.pairIssuedAt,
        expiresAt: this.status.expiresAt,
      });

      this.activePollingPromise = this.pollForCredentials(currentRunToken, deviceCode, {
        intervalSeconds: Math.max(2, Number(beginResponse.interval) || 5),
        expiresAt,
      })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          this.setStatus({
            phase: 'error',
            lastError: message,
            lastMessage: null,
          });
          this.emit('error', { message });
        })
        .finally(() => {
          if (this.activePollingPromise) {
            this.activePollingPromise = null;
          }
        });

      return {
        pairUrl: this.status.pairUrl!,
        pairQrCode: this.status.pairQrCode,
        pairIssuedAt,
        expiresAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus({
        phase: 'error',
        lastError: message,
        lastMessage: null,
      });
      this.emit('error', { message });
      throw error;
    }
  }

  async configureExistingApp(appId: string, appSecret: string): Promise<void> {
    const cleanAppId = appId.trim();
    const cleanAppSecret = appSecret.trim();
    if (!cleanAppId || !cleanAppSecret) {
      throw new Error('App ID 和 App Secret 不能为空');
    }

    this.cancelActiveFlow();
    const currentRunToken = ++this.runToken;

    try {
      this.setStatus({
        phase: 'installing',
        lastError: null,
        lastMessage: '正在校验已有飞书应用...',
        pairUrl: null,
        pairQrCode: null,
        pairIssuedAt: null,
        expiresAt: null,
      });

      await this.ensureOfficialPluginInstalled(false);
      this.ensureRunIsCurrent(currentRunToken);

      const valid = await validateFeishuAppCredentials(cleanAppId, cleanAppSecret);
      if (!valid) {
        throw new Error('App ID 或 App Secret 无效，请检查后重试');
      }

      this.ensureRunIsCurrent(currentRunToken);
      await this.applySuccessfulOnboarding(cleanAppId, cleanAppSecret);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus({
        phase: 'error',
        lastError: message,
        lastMessage: null,
      });
      this.emit('error', { message });
      throw error;
    }
  }

  private cancelActiveFlow(): void {
    this.runToken += 1;
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    this.activePollingPromise = null;
  }

  private ensureRunIsCurrent(runToken: number): void {
    if (runToken !== this.runToken) {
      throw new Error('当前飞书扫码流程已被新的操作替换，请重新开始');
    }
  }

  private setStatus(partial: Partial<FeishuOnboardingStatus>): void {
    this.status = {
      ...this.status,
      ...partial,
    };
    this.emit('status', this.getStatus());
  }

  private async ensureOfficialPluginInstalled(reinstallPlugin: boolean): Promise<void> {
    await this.refreshStatus();

    if (this.status.pluginInstalled && !reinstallPlugin) {
      await this.normalizeOfficialPluginConfig({ seedDisabledWhenEmpty: !this.status.configured });
      this.status.pluginInstalled = true;
      return;
    }

    await this.preparePluginInstallState(reinstallPlugin || this.status.pluginInstalled);

    const installResult = await this.runOpenClawCli(['plugins', 'install', FEISHU_OFFICIAL_PLUGIN_PACKAGE]);
    if (!installResult.success) {
      const details = [installResult.error, installResult.stderr, installResult.stdout].filter(Boolean).join('\n');
      throw new Error(details || '安装飞书官方插件失败');
    }

    await this.refreshStatus();
    await this.normalizeOfficialPluginConfig({ seedDisabledWhenEmpty: !this.status.configured });
    this.status.pluginInstalled = true;
  }

  private async preparePluginInstallState(reinstallOfficialPlugin: boolean): Promise<void> {
    const config = await readOpenClawConfig();
    const plugins = typeof config.plugins === 'object' && config.plugins && !Array.isArray(config.plugins)
      ? { ...config.plugins }
      : {};
    const entries = typeof plugins.entries === 'object' && plugins.entries && !Array.isArray(plugins.entries)
      ? { ...(plugins.entries as Record<string, unknown>) }
      : {};

    entries.feishu = {
      ...(typeof entries.feishu === 'object' && entries.feishu && !Array.isArray(entries.feishu)
        ? entries.feishu as Record<string, unknown>
        : {}),
      enabled: false,
    };

    delete entries['openclaw-lark'];
    delete entries['@larksuite/openclaw-lark'];
    if (reinstallOfficialPlugin) {
      delete entries[FEISHU_OFFICIAL_PLUGIN_ID];
    }

    const allow = Array.isArray(plugins.allow)
      ? plugins.allow.filter((item): item is string => typeof item === 'string')
      : [];
    const nextAllow = allow.filter((item) => {
      if (item === 'feishu' || item === 'openclaw-lark' || item === '@larksuite/openclaw-lark') {
        return false;
      }
      if (reinstallOfficialPlugin && item === FEISHU_OFFICIAL_PLUGIN_ID) {
        return false;
      }
      return true;
    });

    const nextConfig: OpenClawConfig = {
      ...config,
      plugins: {
        ...plugins,
        allow: nextAllow,
        entries,
      },
    };

    await writeOpenClawConfig(nextConfig);

    const openclawConfigDir = getOpenClawConfigDir();
    const conflictDir = join(openclawConfigDir, 'extensions', FEISHU_CONFLICT_EXTENSION_DIR);
    if (existsSync(conflictDir)) {
      rmSync(conflictDir, { recursive: true, force: true });
    }

    if (reinstallOfficialPlugin) {
      const officialDir = join(openclawConfigDir, 'extensions', FEISHU_OFFICIAL_PLUGIN_ID);
      if (existsSync(officialDir)) {
        rmSync(officialDir, { recursive: true, force: true });
      }
    }
  }

  private async normalizeOfficialPluginConfig(options: { seedDisabledWhenEmpty: boolean }): Promise<void> {
    const config = await readOpenClawConfig();
    const finalized = finalizeFeishuOfficialPluginConfig(config as Record<string, unknown>, {
      seedDisabledWhenEmpty: options.seedDisabledWhenEmpty,
    });

    if (finalized.changed) {
      await writeOpenClawConfig(finalized.config as OpenClawConfig);
    }
  }

  private async applySuccessfulOnboarding(
    appId: string,
    appSecret: string,
    openId?: string | null
  ): Promise<void> {
    const config = await readOpenClawConfig();
    const finalized = finalizeFeishuOfficialPluginConfig(config as Record<string, unknown>, {
      credentials: {
        appId,
        appSecret,
        openId,
      },
    });

    const nextConfig = finalized.config as OpenClawConfig;
    upsertLawClawChannelBinding(nextConfig, 'feishu');
    await writeOpenClawConfig(nextConfig);

    this.setStatus({
      phase: 'configured',
      configured: true,
      pluginInstalled: true,
      pairUrl: null,
      pairQrCode: null,
      pairIssuedAt: null,
      expiresAt: null,
      lastError: null,
      lastMessage: '飞书机器人已创建并绑定到当前 LawClaw',
    });

    this.emit('connected', {
      configured: true,
    });
  }

  private async pollForCredentials(
    runToken: number,
    deviceCode: string,
    options: { intervalSeconds: number; expiresAt: number | null }
  ): Promise<void> {
    const startedAt = Date.now();
    let intervalSeconds = options.intervalSeconds;
    const defaultExpiresAt = options.expiresAt ?? startedAt + 600_000;

    while (Date.now() < defaultExpiresAt) {
      this.ensureRunIsCurrent(runToken);
      this.activeAbortController = new AbortController();
      this.setStatus({
        phase: 'polling',
        lastMessage: '等待扫码确认并创建机器人...',
      });

      let pollResponse: FeishuRegistrationPollResponse;
      try {
        pollResponse = await postFeishuRegistrationForm<FeishuRegistrationPollResponse>(
          {
            action: 'poll',
            device_code: deviceCode,
          },
          this.activeAbortController.signal
        );
      } catch (error) {
        if (this.activeAbortController.signal.aborted) {
          return;
        }
        throw error;
      } finally {
        this.activeAbortController = null;
      }

      this.ensureRunIsCurrent(runToken);

      if (pollResponse.client_id && pollResponse.client_secret) {
        await this.applySuccessfulOnboarding(
          pollResponse.client_id,
          pollResponse.client_secret,
          pollResponse.user_info?.open_id
        );
        return;
      }

      switch (pollResponse.error) {
        case undefined:
        case 'authorization_pending':
          break;
        case 'slow_down':
          intervalSeconds += 5;
          break;
        case 'access_denied':
          throw new Error('飞书扫码授权已被拒绝，请重新发起创建机器人流程');
        case 'expired_token':
          throw new Error('当前飞书扫码二维码已过期，请刷新后重新扫码');
        default:
          throw new Error(
            pollResponse.error_description
              || pollResponse.error
              || '飞书官方服务返回了未知错误'
          );
      }

      await delay(intervalSeconds * 1000);
    }

    throw new Error('等待飞书扫码超时，请刷新二维码后重试');
  }

  private async runOpenClawCli(args: string[]): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    error?: string;
  }> {
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
        cliEnv = applyOpenClawConfigEnvFallbacks(readFileSync(configPath, 'utf-8'), cliEnv);
      }
    } catch (error) {
      logger.warn('[FeishuOnboarding] Failed to apply OpenClaw config env fallbacks', error);
    }

    cliEnv = applyBundledNpmToCliEnv(cliEnv);

    return await new Promise((resolve) => {
      const child = spawn(getNodeExecForCli(), [status.entryPath, ...args], {
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
  }
}

export const feishuOnboardingManager = new FeishuOnboardingManager();
