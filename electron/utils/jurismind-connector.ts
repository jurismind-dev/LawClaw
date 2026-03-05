import { app } from 'electron';
import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { logger } from './logger';
import { renderQrPngBase64 } from './qr-code';

export interface JurismindConnectorStatus {
  running: boolean;
  connected: boolean;
  hasBinding: boolean;
  pid: number | null;
  relayUrl: string;
  pairUrl: string | null;
  pairQrCode: string | null;
  pairIssuedAt: number | null;
  lastError: string | null;
  lastLog: string | null;
}

export interface JurismindPairResult {
  pairUrl: string;
  pairQrCode: string | null;
  pairIssuedAt: number;
}

export interface JurismindPairingOptions {
  forceRefresh?: boolean;
  timeoutMs?: number;
  resetAuth?: boolean;
}

type PendingPairWaiter = {
  resolve: (value: JurismindPairResult) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

function buildDefaultH5Url(relayUrl: string): string {
  const trimmed = String(relayUrl || '').trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    const basePath = url.pathname.replace(/\/+$/, '');
    url.pathname = `${basePath}/api/connector/open`;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return `${trimmed.replace(/\/+$/, '')}/api/connector/open`;
  }
}

class JurismindConnectorManager extends EventEmitter {
  private connectorProcess: ChildProcess | null = null;
  private stdoutBuffer = '';
  private stderrBuffer = '';
  private running = false;
  private connected = false;
  private pairUrl: string | null = null;
  private pairQrCode: string | null = null;
  private pairIssuedAt = 0;
  private lastError: string | null = null;
  private lastLog: string | null = null;
  private pendingPairWaiters: PendingPairWaiter[] = [];
  private forceLoginOnNextPair = false;

  private readonly relayUrl = (process.env.LAWCLAW_APP_RELAY_URL || 'https://lawclaw-app.jurismind.com').trim();
  private readonly h5Url = (process.env.LAWCLAW_APP_H5_URL || buildDefaultH5Url(this.relayUrl)).trim();
  private readonly authFilePath = (
    process.env.CONNECTOR_AUTH_FILE || join(homedir(), '.lawclaw', 'connector-auth.json')
  ).trim();
  private readonly appDeviceIdentityPath = join(app.getPath('userData'), 'clawx-device-identity.json');

  getStatus(): JurismindConnectorStatus {
    const hasBinding = existsSync(this.authFilePath);
    const fallbackQr = renderQrPngBase64(this.h5Url);
    const qrCode = this.connected
      ? (fallbackQr ? `data:image/png;base64,${fallbackQr}` : null)
      : (this.pairQrCode || (fallbackQr ? `data:image/png;base64,${fallbackQr}` : null));
    return {
      running: this.running,
      connected: this.connected,
      hasBinding,
      pid: this.connectorProcess?.pid || null,
      relayUrl: this.relayUrl,
      pairUrl: this.connected ? this.h5Url : (this.pairUrl || this.h5Url),
      pairQrCode: qrCode,
      pairIssuedAt: this.pairIssuedAt || null,
      lastError: this.lastError,
      lastLog: this.lastLog,
    };
  }

  async startPairing(options: JurismindPairingOptions = {}): Promise<JurismindPairResult> {
    const timeoutMs = Math.max(5000, options.timeoutMs || 30000);

    if (options.forceRefresh || options.resetAuth) {
      await this.stop(options.resetAuth ? 'rebind-reset-auth' : 'force-refresh');
      if (options.resetAuth) {
        this.clearSavedBinding();
        this.forceLoginOnNextPair = true;
      }
      this.resetPairState();
    }

    await this.ensureRunning();

    if (this.connected) {
      const fallbackQr = renderQrPngBase64(this.h5Url);
      return {
        pairUrl: this.h5Url,
        pairQrCode: fallbackQr ? `data:image/png;base64,${fallbackQr}` : this.pairQrCode,
        pairIssuedAt: this.pairIssuedAt || Date.now(),
      };
    }

    if (this.pairUrl && Date.now() - this.pairIssuedAt < 240000) {
      return {
        pairUrl: this.pairUrl,
        pairQrCode: this.pairQrCode,
        pairIssuedAt: this.pairIssuedAt,
      };
    }

    return await this.waitForPairUrl(timeoutMs);
  }

  clearSavedBinding(): void {
    try {
      rmSync(this.authFilePath, { force: true });
      logger.info(`[JurismindConnector] cleared saved binding token: ${this.authFilePath}`);
    } catch (error) {
      logger.warn('[JurismindConnector] clearSavedBinding failed:', error);
    }
  }

  async clearBinding(): Promise<void> {
    await this.stop('clear-binding');
    this.clearSavedBinding();
    this.resetPairState();
    this.lastError = null;
    this.emitStatus();
  }

  async stop(reason = 'manual-stop'): Promise<void> {
    const child = this.connectorProcess;
    if (!child) {
      this.running = false;
      this.connected = false;
      this.emitStatus();
      return;
    }

    logger.info(`[JurismindConnector] stopping connector process (${reason})`);

    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
        done();
      }, 2000);

      child.once('exit', () => {
        clearTimeout(timer);
        done();
      });

      try {
        child.kill('SIGTERM');
      } catch {
        clearTimeout(timer);
        done();
      }
    });

    this.connectorProcess = null;
    this.running = false;
    this.connected = false;
    this.emitStatus();
  }

  private resetPairState(): void {
    this.pairUrl = null;
    this.pairQrCode = null;
    this.pairIssuedAt = 0;
  }

  private async ensureRunning(): Promise<void> {
    if (this.connectorProcess && this.running) return;

    const runtime = this.resolveConnectorRuntime();
    if (!runtime) {
      throw new Error('未找到本地 connector 运行文件，请确认 connector-runtime 已包含在当前环境');
    }

    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    this.lastError = null;

    const env = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      RELAY_URL: this.relayUrl,
      CONNECTOR_TOKEN: '',
      CONNECTOR_AUTH_FILE: this.authFilePath,
      CONNECTOR_DEVICE_KEY_PATH:
        process.env.CONNECTOR_DEVICE_KEY_PATH ||
        (existsSync(this.appDeviceIdentityPath) ? this.appDeviceIdentityPath : ''),
      CONNECTOR_AUTH_MODE: 'pair',
      CONNECTOR_AUTO_AUTHORIZE: 'true',
      CONNECTOR_PAIR_OPEN_BROWSER: 'false',
      CONNECTOR_AUTH_OPEN_BROWSER: 'false',
      CONNECTOR_AUTH_TIMEOUT_MS: process.env.CONNECTOR_AUTH_TIMEOUT_MS || '600000',
      CONNECTOR_PAIR_POLL_INTERVAL_MS: process.env.CONNECTOR_PAIR_POLL_INTERVAL_MS || '1500',
    };

    const child = spawn(process.execPath, [runtime.entryPath], {
      cwd: runtime.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });

    this.connectorProcess = child;
    this.running = true;
    this.connected = false;

    if (!child.stdout || !child.stderr) {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      throw new Error('connector process stdio unavailable');
    }

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk: string) => {
      this.handleOutputChunk(chunk, 'stdout');
    });
    child.stderr.on('data', (chunk: string) => {
      this.handleOutputChunk(chunk, 'stderr');
    });

    child.on('error', (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      this.lastError = msg;
      this.running = false;
      this.connected = false;
      this.rejectPendingPairWaiters(new Error(msg));
      this.emit('error', { message: msg });
      this.emitStatus();
      logger.error('[JurismindConnector] process error', error);
    });

    child.on('exit', (code, signal) => {
      this.running = false;
      this.connected = false;
      this.connectorProcess = null;
      const reason = `connector process exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`;
      if (code !== 0 && !this.lastError) {
        this.lastError = reason;
      }
      this.rejectPendingPairWaiters(new Error(reason));
      this.emit('status', this.getStatus());
      logger.warn(`[JurismindConnector] ${reason}`);
    });

    this.emitStatus();
    logger.info(`[JurismindConnector] started pid=${child.pid} relay=${this.relayUrl}`);
  }

  private resolveConnectorRuntime(): { entryPath: string; cwd: string } | null {
    const devRuntimePath = join(app.getAppPath(), 'connector-runtime', 'index.js');
    if (existsSync(devRuntimePath)) {
      return { entryPath: devRuntimePath, cwd: join(app.getAppPath(), 'connector-runtime') };
    }

    const packagedPath1 = join(process.resourcesPath, 'connector-runtime', 'index.js');
    if (existsSync(packagedPath1)) {
      return { entryPath: packagedPath1, cwd: join(process.resourcesPath, 'connector-runtime') };
    }

    return null;
  }

  private handleOutputChunk(chunk: string, source: 'stdout' | 'stderr'): void {
    if (!chunk) return;

    if (source === 'stdout') {
      this.stdoutBuffer += chunk;
    } else {
      this.stderrBuffer += chunk;
    }

    let buffer = source === 'stdout' ? this.stdoutBuffer : this.stderrBuffer;
    let idx = buffer.indexOf('\n');
    while (idx >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, '');
      buffer = buffer.slice(idx + 1);
      this.handleOutputLine(line, source);
      idx = buffer.indexOf('\n');
    }

    if (source === 'stdout') {
      this.stdoutBuffer = buffer;
    } else {
      this.stderrBuffer = buffer;
    }
  }

  private handleOutputLine(rawLine: string, source: 'stdout' | 'stderr'): void {
    const line = rawLine.trim();
    if (!line) return;

    this.lastLog = line;
    this.emit('log', { source, line });

    const pairMatch = line.match(/\[PAIR_URL\]\s+(\S+)/);
    if (pairMatch?.[1]) {
      const pairUrl = this.decoratePairUrl(pairMatch[1]);
      const qrBase64 = renderQrPngBase64(pairUrl);
      this.pairUrl = pairUrl;
      this.pairQrCode = qrBase64 ? `data:image/png;base64,${qrBase64}` : null;
      this.pairIssuedAt = Date.now();
      this.lastError = null;

      const payload: JurismindPairResult = {
        pairUrl,
        pairQrCode: this.pairQrCode,
        pairIssuedAt: this.pairIssuedAt,
      };
      this.resolvePendingPairWaiters(payload);
      this.emit('pair-url', payload);
      this.emitStatus();
      return;
    }

    if (line.includes('已连接中继')) {
      this.connected = true;
      if (!this.pairQrCode) {
        const fallbackQr = renderQrPngBase64(this.h5Url);
        this.pairQrCode = fallbackQr ? `data:image/png;base64,${fallbackQr}` : null;
      }
      if (!this.pairIssuedAt) {
        this.pairIssuedAt = Date.now();
      }
      this.lastError = null;
      this.emit('connected', { connected: true, line });
      this.emitStatus();
      return;
    }

    if (line.includes('中继连接关闭') || line.includes('连接器令牌不可用')) {
      this.connected = false;
      this.emitStatus();
      return;
    }

    if (source === 'stderr' || line.includes('[ERROR]') || line.includes('启动失败')) {
      this.lastError = line;
      this.emit('error', { message: line });
      this.emitStatus();
    }
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus());
  }

  private decoratePairUrl(rawPairUrl: string): string {
    const pairUrl = String(rawPairUrl || '')
      .replace(/\u001b\[[0-9;]*m/g, '')
      .replace(/[\u0000-\u001f]+/g, '')
      .trim();
    if (!pairUrl) return pairUrl;

    if (!this.forceLoginOnNextPair) {
      return pairUrl;
    }
    this.forceLoginOnNextPair = false;

    try {
      const url = new URL(pairUrl, this.h5Url);
      url.searchParams.set('forceLogin', '1');
      return url.toString();
    } catch {
      const joiner = pairUrl.includes('?') ? '&' : '?';
      return `${pairUrl}${joiner}forceLogin=1`;
    }
  }

  private waitForPairUrl(timeoutMs: number): Promise<JurismindPairResult> {
    return new Promise<JurismindPairResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingPairWaiters = this.pendingPairWaiters.filter((item) => item.timer !== timer);
        reject(new Error('等待绑定二维码超时，请重试'));
      }, timeoutMs);

      this.pendingPairWaiters.push({ resolve, reject, timer });
    });
  }

  private resolvePendingPairWaiters(payload: JurismindPairResult): void {
    if (this.pendingPairWaiters.length === 0) return;
    const waiters = this.pendingPairWaiters.splice(0, this.pendingPairWaiters.length);
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve(payload);
    }
  }

  private rejectPendingPairWaiters(error: Error): void {
    if (this.pendingPairWaiters.length === 0) return;
    const waiters = this.pendingPairWaiters.splice(0, this.pendingPairWaiters.length);
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }
}

export const jurismindConnectorManager = new JurismindConnectorManager();
