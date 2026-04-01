import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  readOpenClawConfig,
  type OpenClawConfig,
  upsertLawClawChannelBinding,
  writeOpenClawConfig,
  deleteChannelConfig,
} from './channel-config';
import { logger } from './logger';
import { applyOpenClawConfigEnvFallbacks } from './openclaw-config-env';
import { applyBundledNpmToCliEnv, getNodeExecForCli } from './openclaw-cli';
import { detectPluginInstallationState, isAlreadyInstalledErrorMessage } from './openclaw-plugin-install';
import { ensureDir, getOpenClawConfigDir, getOpenClawStatus } from './paths';
import { renderQrPngBase64 } from './qr-code';
import { stripUtf8Bom } from './text-encoding';
import {
  WEIXIN_CHANNEL_ID,
  WEIXIN_DEFAULT_ACCOUNT_NAME,
  WEIXIN_DEFAULT_BASE_URL,
  WEIXIN_DEFAULT_BOT_TYPE,
  WEIXIN_DEFAULT_CDN_BASE_URL,
  WEIXIN_PLUGIN_NPM_SPEC,
  WEIXIN_PLUGIN_VERSION,
  getInstalledWeixinPluginVersion,
  getPrimaryWeixinAccountId,
  hasStoredWeixinCredentials,
  isWeixinPluginInstalledDirPresent,
  normalizeWeixinAccountId,
  registerWeixinAccountId,
  saveWeixinAccountData,
} from './weixin-channel-state';

type WeixinOnboardingPhase =
  | 'idle'
  | 'installing'
  | 'waiting_scan'
  | 'polling'
  | 'configured'
  | 'error';

interface WeixinQrStartResponse {
  qrcode?: string;
  qrcode_img_content?: string;
}

interface WeixinQrPollResponse {
  status?: string;
  bot_token?: string;
  ilink_bot_id?: string;
  ilink_user_id?: string;
  baseurl?: string;
}

export interface WeixinOnboardingStatus {
  phase: WeixinOnboardingPhase;
  pluginInstalled: boolean;
  configured: boolean;
  pairUrl: string | null;
  pairQrCode: string | null;
  pairIssuedAt: number | null;
  expiresAt: number | null;
  accountId: string | null;
  lastError: string | null;
  lastMessage: string | null;
}

export interface WeixinOnboardingResult {
  pairUrl: string;
  pairQrCode: string | null;
  pairIssuedAt: number;
  expiresAt: number | null;
}

export interface WeixinOnboardingStartOptions {
  forceRefresh?: boolean;
}

class WeixinOnboardingCancelledError extends Error {
  constructor(message = '当前微信流程已取消') {
    super(message);
    this.name = 'WeixinOnboardingCancelledError';
  }
}

export function isWeixinOnboardingCancelledError(
  error: unknown
): error is WeixinOnboardingCancelledError {
  return error instanceof WeixinOnboardingCancelledError;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function trimString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

class WeixinOnboardingManager extends EventEmitter {
  private status: WeixinOnboardingStatus = {
    phase: 'idle',
    pluginInstalled: false,
    configured: false,
    pairUrl: null,
    pairQrCode: null,
    pairIssuedAt: null,
    expiresAt: null,
    accountId: null,
    lastError: null,
    lastMessage: null,
  };

  private runToken = 0;
  private activeAbortController: AbortController | null = null;
  private activePollingPromise: Promise<void> | null = null;
  private pluginInstallPromise: Promise<void> | null = null;

  getStatus(): WeixinOnboardingStatus {
    return { ...this.status };
  }

  async refreshStatus(): Promise<WeixinOnboardingStatus> {
    const config = await readOpenClawConfig();
    const pluginInstalled = detectPluginInstallationState(WEIXIN_CHANNEL_ID, {
      hasExtensionDir: await isWeixinPluginInstalledDirPresent(),
      config: config as Record<string, unknown>,
    }).installed;
    const configured = await hasStoredWeixinCredentials();
    const accountId = await getPrimaryWeixinAccountId();

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
      accountId,
      lastError: configured ? null : this.status.lastError,
    };

    return this.getStatus();
  }

  async startPairing(
    options: WeixinOnboardingStartOptions = {}
  ): Promise<WeixinOnboardingResult> {
    await this.refreshStatus();

    if (
      !options.forceRefresh
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

    if (options.forceRefresh) {
      this.cancelActiveFlow();
    }

    const currentRunToken = ++this.runToken;

    try {
      this.setStatus({
        phase: 'installing',
        pairUrl: null,
        pairQrCode: null,
        pairIssuedAt: null,
        expiresAt: null,
        lastError: null,
        lastMessage: '正在准备微信插件...',
      });

      await this.ensurePluginInstalled();
      this.ensureRunIsCurrent(currentRunToken);

      const config = await readOpenClawConfig();
      const baseUrl = this.resolveBaseUrl(config);
      const routeTag = this.resolveRouteTag(config);
      const qrStart = await this.fetchQrCode(baseUrl, routeTag);
      this.ensureRunIsCurrent(currentRunToken);

      const pairUrl = trimString(qrStart.qrcode_img_content);
      const qrcode = trimString(qrStart.qrcode);
      if (!pairUrl || !qrcode) {
        throw new Error('微信服务未返回可扫码的绑定二维码');
      }

      const pairQrCodeBase64 = renderQrPngBase64(pairUrl);
      const pairIssuedAt = Date.now();
      const expiresAt = pairIssuedAt + 5 * 60_000;

      this.setStatus({
        phase: 'waiting_scan',
        pairUrl,
        pairQrCode: pairQrCodeBase64 ? `data:image/png;base64,${pairQrCodeBase64}` : null,
        pairIssuedAt,
        expiresAt,
        lastError: null,
        lastMessage: '请使用微信扫描二维码完成绑定',
      });

      this.emit('pair-url', {
        pairUrl: this.status.pairUrl,
        pairQrCode: this.status.pairQrCode,
        pairIssuedAt: this.status.pairIssuedAt,
        expiresAt: this.status.expiresAt,
      });

      this.activePollingPromise = this.pollForLogin(currentRunToken, {
        qrcode,
        baseUrl,
        routeTag,
        expiresAt,
      })
        .catch((error) => {
          if (isWeixinOnboardingCancelledError(error)) {
            return;
          }

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
      if (isWeixinOnboardingCancelledError(error)) {
        throw error;
      }

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

  async clearBinding(accountId?: string): Promise<WeixinOnboardingStatus> {
    this.cancelActiveFlow();
    await deleteChannelConfig(WEIXIN_CHANNEL_ID, accountId);
    await this.refreshStatus();

    this.setStatus({
      phase: this.status.configured ? 'configured' : 'idle',
      pairUrl: null,
      pairQrCode: null,
      pairIssuedAt: null,
      expiresAt: null,
      lastError: null,
      lastMessage: null,
    });

    return this.getStatus();
  }

  private resolveBaseUrl(config: OpenClawConfig): string {
    const section = asObject(config.channels?.[WEIXIN_CHANNEL_ID]);
    return trimString(section?.baseUrl) || WEIXIN_DEFAULT_BASE_URL;
  }

  private resolveCdnBaseUrl(config: OpenClawConfig): string {
    const section = asObject(config.channels?.[WEIXIN_CHANNEL_ID]);
    return trimString(section?.cdnBaseUrl) || WEIXIN_DEFAULT_CDN_BASE_URL;
  }

  private resolveRouteTag(config: OpenClawConfig): string | undefined {
    const section = asObject(config.channels?.[WEIXIN_CHANNEL_ID]);
    if (typeof section?.routeTag === 'number') {
      return String(section.routeTag);
    }
    return trimString(section?.routeTag);
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
      throw new WeixinOnboardingCancelledError();
    }
  }

  private setStatus(partial: Partial<WeixinOnboardingStatus>): void {
    this.status = {
      ...this.status,
      ...partial,
    };
    this.emit('status', this.getStatus());
  }

  private async ensurePluginInstalled(): Promise<void> {
    await this.refreshStatus();
    const installedVersion = await getInstalledWeixinPluginVersion();
    if (this.status.pluginInstalled && installedVersion === WEIXIN_PLUGIN_VERSION) {
      return;
    }

    if (this.pluginInstallPromise) {
      await this.pluginInstallPromise;
      await this.refreshStatus();
      const resolvedInstalledVersion = await getInstalledWeixinPluginVersion();
      if (this.status.pluginInstalled && resolvedInstalledVersion === WEIXIN_PLUGIN_VERSION) {
        return;
      }
    }

    const installPromise = (async () => {
      const currentInstalledVersion = await getInstalledWeixinPluginVersion();
      if (currentInstalledVersion && currentInstalledVersion !== WEIXIN_PLUGIN_VERSION) {
        this.setStatus({
          phase: 'installing',
          lastMessage:
            `检测到微信插件版本 ${currentInstalledVersion} 与内置 OpenClaw ${getOpenClawStatus().version || '当前版本'} 不兼容，正在切换到 ${WEIXIN_PLUGIN_VERSION}...`,
        });

        const uninstallResult = await this.runOpenClawCli(['plugins', 'uninstall', WEIXIN_CHANNEL_ID]);
        if (!uninstallResult.success) {
          const uninstallDetails = [uninstallResult.error, uninstallResult.stderr, uninstallResult.stdout]
            .filter(Boolean)
            .join('\n');
          throw new Error(uninstallDetails || '卸载不兼容的微信插件失败');
        }
      }

      const installResult = await this.runOpenClawCli(['plugins', 'install', WEIXIN_PLUGIN_NPM_SPEC]);
      if (!installResult.success) {
        const details = [installResult.error, installResult.stderr, installResult.stdout]
          .filter(Boolean)
          .join('\n');
        if (!isAlreadyInstalledErrorMessage(details)) {
          throw new Error(details || '安装微信插件失败');
        }
      }

      await this.refreshStatus();
      const resolvedInstalledVersion = await getInstalledWeixinPluginVersion();
      if (resolvedInstalledVersion !== WEIXIN_PLUGIN_VERSION) {
        throw new Error(
          `微信插件版本校验失败：期望 ${WEIXIN_PLUGIN_VERSION}，实际 ${resolvedInstalledVersion || 'unknown'}`
        );
      }
    })();

    this.pluginInstallPromise = installPromise;
    try {
      await installPromise;
    } finally {
      if (this.pluginInstallPromise === installPromise) {
        this.pluginInstallPromise = null;
      }
    }
  }

  private async fetchQrCode(
    baseUrl: string,
    routeTag?: string
  ): Promise<WeixinQrStartResponse> {
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const url = new URL(`ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(WEIXIN_DEFAULT_BOT_TYPE)}`, base);
    const headers: Record<string, string> = {};

    if (routeTag) {
      headers.SKRouteTag = routeTag;
    }

    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      const body = await response.text().catch(() => '(unreadable)');
      throw new Error(`微信二维码获取失败: ${response.status} ${response.statusText} ${body}`);
    }

    return response.json() as Promise<WeixinQrStartResponse>;
  }

  private async pollQrStatus(
    baseUrl: string,
    qrcode: string,
    routeTag?: string
  ): Promise<WeixinQrPollResponse> {
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const url = new URL(`ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`, base);
    const headers: Record<string, string> = {
      'iLink-App-ClientVersion': '1',
    };

    if (routeTag) {
      headers.SKRouteTag = routeTag;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35_000);
    this.activeAbortController = controller;

    try {
      const response = await fetch(url.toString(), {
        headers,
        signal: controller.signal,
      });

      const rawText = await response.text();
      if (!response.ok) {
        throw new Error(`微信二维码状态轮询失败: ${response.status} ${response.statusText} ${rawText}`);
      }

      return JSON.parse(rawText) as WeixinQrPollResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { status: 'wait' };
      }
      throw error;
    } finally {
      clearTimeout(timer);
      if (this.activeAbortController === controller) {
        this.activeAbortController = null;
      }
    }
  }

  private async pollForLogin(
    runToken: number,
    options: { qrcode: string; baseUrl: string; routeTag?: string; expiresAt: number | null }
  ): Promise<void> {
    const deadline = options.expiresAt ?? Date.now() + 8 * 60_000;

    while (Date.now() < deadline) {
      this.ensureRunIsCurrent(runToken);

      this.setStatus({
        phase: 'polling',
        lastMessage: '等待微信确认绑定...',
      });

      const status = await this.pollQrStatus(options.baseUrl, options.qrcode, options.routeTag);
      this.ensureRunIsCurrent(runToken);

      const botToken = trimString(status.bot_token);
      const accountId = trimString(status.ilink_bot_id);
      if (botToken && accountId) {
        await this.applySuccessfulOnboarding({
          accountId,
          botToken,
          baseUrl: trimString(status.baseurl) || options.baseUrl,
          userId: trimString(status.ilink_user_id),
        });
        return;
      }

      switch (trimString(status.status) || 'wait') {
        case 'wait':
          break;
        case 'scaned':
          this.setStatus({
            phase: 'polling',
            lastMessage: '已扫码，等待微信完成授权...',
          });
          break;
        case 'expired':
          throw new Error('当前微信二维码已过期，请刷新后重新扫码');
        default:
          break;
      }

      await delay(1000);
    }

    throw new Error('等待微信扫码超时，请刷新二维码后重试');
  }

  private async applySuccessfulOnboarding(payload: {
    accountId: string;
    botToken: string;
    baseUrl: string;
    userId?: string;
  }): Promise<void> {
    const normalizedAccountId = normalizeWeixinAccountId(payload.accountId);
    await saveWeixinAccountData(normalizedAccountId, {
      token: payload.botToken,
      baseUrl: payload.baseUrl,
      userId: payload.userId,
    });
    await registerWeixinAccountId(normalizedAccountId);

    const config = await readOpenClawConfig();
    const existingSection = asObject(config.channels?.[WEIXIN_CHANNEL_ID]) || {};
    const existingAccounts = asObject(existingSection.accounts) || {};
    const existingAccountSection = asObject(existingAccounts[normalizedAccountId]) || {};
    const cdnBaseUrl = this.resolveCdnBaseUrl(config);

    const nextConfig: OpenClawConfig = {
      ...config,
      channels: {
        ...(config.channels || {}),
        [WEIXIN_CHANNEL_ID]: {
          ...existingSection,
          enabled: true,
          baseUrl: payload.baseUrl,
          cdnBaseUrl,
          accounts: {
            ...existingAccounts,
            [normalizedAccountId]: {
              ...existingAccountSection,
              enabled: true,
              name: trimString(existingAccountSection.name) || WEIXIN_DEFAULT_ACCOUNT_NAME,
              baseUrl: payload.baseUrl,
              cdnBaseUrl,
            },
          },
        },
      },
      plugins: {
        ...(config.plugins || {}),
        enabled: true,
        allow: Array.from(
          new Set([
            ...(Array.isArray(config.plugins?.allow)
              ? config.plugins.allow.filter((item): item is string => typeof item === 'string')
              : []),
            WEIXIN_CHANNEL_ID,
          ])
        ),
        entries: {
          ...(config.plugins?.entries || {}),
          [WEIXIN_CHANNEL_ID]: {
            ...(asObject(config.plugins?.entries?.[WEIXIN_CHANNEL_ID]) || {}),
            enabled: true,
          },
        },
      },
    };

    upsertLawClawChannelBinding(nextConfig, WEIXIN_CHANNEL_ID);
    await writeOpenClawConfig(nextConfig);

    this.setStatus({
      phase: 'configured',
      configured: true,
      pluginInstalled: true,
      pairUrl: null,
      pairQrCode: null,
      pairIssuedAt: null,
      expiresAt: null,
      accountId: normalizedAccountId,
      lastError: null,
      lastMessage: '微信已绑定到当前 LawClaw',
    });

    this.emit('connected', {
      configured: true,
      accountId: normalizedAccountId,
    });
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
        cliEnv = applyOpenClawConfigEnvFallbacks(
          stripUtf8Bom(readFileSync(configPath, 'utf-8')),
          cliEnv
        );
      }
    } catch (error) {
      logger.warn('[WeixinOnboarding] Failed to apply OpenClaw config env fallbacks', error);
    }

    cliEnv = applyBundledNpmToCliEnv(cliEnv);
    cliEnv.OPENCLAW_NO_RESPAWN = '1';
    cliEnv.OPENCLAW_EMBEDDED_IN = 'LawClaw';

    const nodeExec = getNodeExecForCli();

    return new Promise((resolve) => {
      const child = spawn(nodeExec, [status.entryPath, ...args], {
        cwd: status.dir,
        env: cliEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdout += String(chunk);
      });

      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += String(chunk);
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
        resolve({
          success: code === 0,
          stdout,
          stderr,
          ...(code === 0 ? {} : { error: `OpenClaw CLI exited with code ${code}` }),
        });
      });
    });
  }
}

export const weixinOnboardingManager = new WeixinOnboardingManager();
