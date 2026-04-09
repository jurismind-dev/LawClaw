import { join } from 'path';
import { homedir } from 'os';
import { createRequire } from 'module';
import { EventEmitter } from 'events';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { getOpenClawDir, getOpenClawResolvedDir } from './paths';
import { renderQrPngBase64 } from './qr-code';

const require = createRequire(import.meta.url);

// Resolve dependencies from OpenClaw package context (pnpm-safe)
const openclawPath = getOpenClawDir();
const openclawResolvedPath = getOpenClawResolvedDir();
const openclawRequire = createRequire(join(openclawResolvedPath, 'package.json'));

type DisconnectReasonMap = {
    loggedOut?: number;
} & Record<string, number | undefined>;

type PinoFactory = (...args: unknown[]) => {
    trace: () => void;
    debug: () => void;
    info: () => void;
    warn: () => void;
    error: () => void;
    fatal: () => void;
    child: () => ReturnType<PinoFactory>;
};

type BaileysSocket = {
    ev: {
        on: (eventName: string, listener: (...args: unknown[]) => void | Promise<void>) => void;
        removeAllListeners: (eventName?: string) => void;
    };
    end: (error?: unknown) => void;
    ws?: {
        close: () => void;
    };
};

type MakeWASocket = (options: {
    version: unknown;
    auth: unknown;
    printQRInTerminal: boolean;
    logger: ReturnType<PinoFactory>;
    connectTimeoutMs: number;
}) => BaileysSocket;

type InitAuth = (authDir: string) => Promise<{
    state: unknown;
    saveCreds: () => Promise<void>;
}>;

type FetchLatestBaileysVersion = () => Promise<{ version: unknown }>;

type BaileysModule = {
    default: MakeWASocket;
    useMultiFileAuthState: InitAuth;
    DisconnectReason: DisconnectReasonMap;
    fetchLatestBaileysVersion: FetchLatestBaileysVersion;
};

type WhatsAppRuntime = {
    makeWASocket: MakeWASocket;
    initAuth: InitAuth;
    DisconnectReason: DisconnectReasonMap;
    fetchLatestBaileysVersion: FetchLatestBaileysVersion;
    baileysRequire: NodeRequire;
};

type WhatsAppRuntimeError = Error & {
    code?: string;
};

let cachedWhatsAppRuntime: WhatsAppRuntime | null = null;
let cachedWhatsAppRuntimeError: WhatsAppRuntimeError | null = null;

function createMissingWhatsAppRuntimeError(reason: string, cause?: unknown): WhatsAppRuntimeError {
    const error = new Error(
        `WhatsApp login is unavailable because its optional runtime dependencies could not be loaded. ${reason}`,
        { cause }
    ) as WhatsAppRuntimeError;
    error.code = 'WHATSAPP_RUNTIME_MISSING';
    return error;
}

function isMissingWhatsAppRuntimeError(error: unknown): error is WhatsAppRuntimeError {
    return error instanceof Error && (error as WhatsAppRuntimeError).code === 'WHATSAPP_RUNTIME_MISSING';
}

function resolveOpenClawPackageJson(packageName: string): string {
    const specifier = `${packageName}/package.json`;
    try {
        return openclawRequire.resolve(specifier);
    } catch (openclawError) {
        try {
            return require.resolve(specifier);
        } catch (rootError) {
            const openclawReason = openclawError instanceof Error ? openclawError.message : String(openclawError);
            const rootReason = rootError instanceof Error ? rootError.message : String(rootError);
            throw createMissingWhatsAppRuntimeError(
                `Failed to resolve "${packageName}". openclawPath=${openclawPath}, ` +
                `resolvedPath=${openclawResolvedPath}. openclawRequire: ${openclawReason}. rootRequire: ${rootReason}`,
                rootError
            );
        }
    }
}

interface BaileysError extends Error {
    output?: { statusCode?: number };
}
type ConnectionState = {
    connection: 'close' | 'open' | 'connecting';
    lastDisconnect?: {
        error?: Error & { output?: { statusCode?: number } };
    };
    qr?: string;
};

function loadWhatsAppRuntime(): WhatsAppRuntime {
    if (cachedWhatsAppRuntime) {
        return cachedWhatsAppRuntime;
    }
    if (cachedWhatsAppRuntimeError) {
        throw cachedWhatsAppRuntimeError;
    }

    try {
        const baileysPackageJsonPath = resolveOpenClawPackageJson('@whiskeysockets/baileys');
        const baileysRequire = createRequire(baileysPackageJsonPath);
        const baileysModule = baileysRequire('@whiskeysockets/baileys') as BaileysModule;

        cachedWhatsAppRuntime = {
            makeWASocket: baileysModule.default,
            initAuth: baileysModule.useMultiFileAuthState,
            DisconnectReason: baileysModule.DisconnectReason,
            fetchLatestBaileysVersion: baileysModule.fetchLatestBaileysVersion,
            baileysRequire,
        };

        return cachedWhatsAppRuntime;
    } catch (error) {
        cachedWhatsAppRuntimeError = isMissingWhatsAppRuntimeError(error)
            ? error
            : createMissingWhatsAppRuntimeError(
                error instanceof Error ? error.message : String(error),
                error
            );
        throw cachedWhatsAppRuntimeError;
    }
}

// --- WhatsApp Login Manager ---

export class WhatsAppLoginManager extends EventEmitter {
    private socket: BaileysSocket | null = null;
    private qr: string | null = null;
    private accountId: string | null = null;
    private active: boolean = false;
    private retryCount: number = 0;
    private maxRetries: number = 5;

    constructor() {
        super();
    }

    /**
     * Finish login: close socket and emit success after credentials are saved
     */
    private async finishLogin(accountId: string): Promise<void> {
        if (!this.active) return;
        console.log('[WhatsAppLogin] Finishing login, closing socket to hand over to Gateway...');
        await this.stop();
        // Allow enough time for WhatsApp server to fully release the session
        await new Promise(resolve => setTimeout(resolve, 5000));
        this.emit('success', { accountId });
    }

    /**
     * Start WhatsApp pairing process
     */
    async start(accountId: string = 'default'): Promise<void> {
        if (this.active && this.accountId === accountId) {
            // Already running for this account, emit current QR if available
            if (this.qr) {
                const base64 = renderQrPngBase64(this.qr);
                if (base64) {
                    this.emit('qr', { qr: base64, raw: this.qr });
                }
            }
            return;
        }

        // Stop existing if different account or restart requested
        if (this.active) {
            await this.stop();
        }

        this.accountId = accountId;
        this.active = true;
        this.qr = null;
        this.retryCount = 0;

        await this.connectToWhatsApp(accountId);
    }

    private async connectToWhatsApp(accountId: string): Promise<void> {
        if (!this.active) return;

        try {
            const {
                makeWASocket,
                initAuth,
                DisconnectReason,
                fetchLatestBaileysVersion,
                baileysRequire,
            } = loadWhatsAppRuntime();

            // Path where OpenClaw expects WhatsApp credentials
            const authDir = join(homedir(), '.openclaw', 'credentials', 'whatsapp', accountId);

            // Ensure directory exists
            if (!existsSync(authDir)) {
                mkdirSync(authDir, { recursive: true });
            }

            console.log(`[WhatsAppLogin] Connecting for ${accountId} at ${authDir} (Attempt ${this.retryCount + 1})`);


            let pino: (...args: unknown[]) => Record<string, unknown>;
            try {
                // Try to resolve pino from baileys context since it's a dependency of baileys
                pino = baileysRequire('pino');
            } catch (e) {
                console.warn('[WhatsAppLogin] Could not load pino from baileys, trying root', e);
                try {
                    pino = require('pino');
                } catch {
                    console.warn('[WhatsAppLogin] Pino not found, using console fallback');
                    // Mock pino logger if missing
                    pino = () => ({
                        trace: () => { },
                        debug: () => { },
                        info: () => { },
                        warn: () => { },
                        error: () => { },
                        fatal: () => { },
                        child: () => pino(),
                    });
                }
            }

            console.log('[WhatsAppLogin] Loading auth state...');
            const { state, saveCreds } = await initAuth(authDir);

            console.log('[WhatsAppLogin] Fetching latest version...');
            const { version } = await fetchLatestBaileysVersion();

            console.log(`[WhatsAppLogin] Starting login for ${accountId}, version: ${version}`);

            this.socket = makeWASocket({
                version,
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: 'silent' }), // Silent logger
                connectTimeoutMs: 60000,
                // mobile: false,
                // browser: ['ClawX', 'Chrome', '1.0.0'],
            });

            let connectionOpened = false;
            let credsReceived = false;
            let credsTimeout: ReturnType<typeof setTimeout> | null = null;

            this.socket.ev.on('creds.update', async () => {
                await saveCreds();
                if (connectionOpened && !credsReceived) {
                    credsReceived = true;
                    if (credsTimeout) clearTimeout(credsTimeout);
                    console.log('[WhatsAppLogin] Credentials saved after connection open, finishing login...');
                    // Small delay to ensure file writes are fully flushed
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    await this.finishLogin(accountId);
                }
            });

            this.socket.ev.on('connection.update', async (update: ConnectionState) => {
                try {
                    const { connection, lastDisconnect, qr } = update;

                    if (qr) {
                        this.qr = qr;
                        console.log('[WhatsAppLogin] QR received');
                        const base64 = renderQrPngBase64(qr);
                        if (base64 && this.active) {
                            this.emit('qr', { qr: base64, raw: qr });
                        }
                    }

                    if (connection === 'close') {
                        const error = lastDisconnect?.error as BaileysError | undefined;
                        const statusCode = error?.output?.statusCode;
                        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
                        // Treat 401 as transient if we haven't exhausted retries (max 2 attempts)
                        // This handles the case where WhatsApp's session hasn't fully released
                        const shouldReconnect = !isLoggedOut || this.retryCount < 2;
                        console.log('[WhatsAppLogin] Connection closed.',
                            'Reconnect:', shouldReconnect,
                            'Active:', this.active,
                            'Error:', error?.message
                        );

                        if (shouldReconnect && this.active) {
                            if (this.retryCount < this.maxRetries) {
                                this.retryCount++;
                                console.log(`[WhatsAppLogin] Reconnecting in 1s... (Attempt ${this.retryCount}/${this.maxRetries})`);
                                setTimeout(() => this.connectToWhatsApp(accountId), 1000);
                            } else {
                                console.log('[WhatsAppLogin] Max retries reached, stopping.');
                                this.active = false;
                                this.emit('error', 'Connection failed after multiple retries');
                            }
                        } else {
                            // Logged out or explicitly stopped
                            this.active = false;
                            if (error?.output?.statusCode === DisconnectReason.loggedOut) {
                                try {
                                    rmSync(authDir, { recursive: true, force: true });
                                } catch (err) {
                                    console.error('[WhatsAppLogin] Failed to clear auth dir:', err);
                                }
                            }
                            if (this.socket) {
                                this.socket.end(undefined);
                                this.socket = null;
                            }
                            this.emit('error', 'Logged out');
                        }
                    } else if (connection === 'open') {
                        console.log('[WhatsAppLogin] Connection opened! Waiting for credentials to be saved...');
                        this.retryCount = 0;
                        connectionOpened = true;

                        // Safety timeout: if creds don't update within 15s, proceed anyway
                        credsTimeout = setTimeout(async () => {
                            if (!credsReceived && this.active) {
                                console.warn('[WhatsAppLogin] Timed out waiting for creds.update after connection open, proceeding...');
                                await this.finishLogin(accountId);
                            }
                        }, 15000);
                    }
                } catch (innerErr) {
                    console.error('[WhatsAppLogin] Error in connection update:', innerErr);
                }
            });

        } catch (error) {
            console.error('[WhatsAppLogin] Fatal Connect Error:', error);
            if (isMissingWhatsAppRuntimeError(error)) {
                this.active = false;
                this.emit('error', error.message);
                return;
            }
            if (this.active && this.retryCount < this.maxRetries) {
                this.retryCount++;
                setTimeout(() => this.connectToWhatsApp(accountId), 2000);
            } else {
                this.active = false;
                const msg = error instanceof Error ? error.message : String(error);
                this.emit('error', msg);
            }
        }
    }

    /**
     * Stop current login process
     */
    async stop(): Promise<void> {
        this.active = false;
        this.qr = null;
        if (this.socket) {
            try {
                // Remove listeners to prevent handling closure as error
                this.socket.ev.removeAllListeners('connection.update');
                // Use ws.close() for proper WebSocket teardown
                // This ensures WhatsApp server receives a clean close frame
                // and releases the session, preventing 401 on next connect
                try {
                    this.socket.ws?.close();
                } catch {
                    // ws may already be closed
                }
                this.socket.end(undefined);
            } catch {
                // Ignore error if socket already closed
            }
            this.socket = null;
        }
    }
}

export const whatsAppLoginManager = new WhatsAppLoginManager();
