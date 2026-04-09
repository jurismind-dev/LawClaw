/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Feishu / Lark SDK client management.
 *
 * Provides `LarkClient` — a unified manager for Lark SDK client instances,
 * WebSocket connections, EventDispatcher lifecycle, and bot identity.
 *
 * Consumers obtain instances via factory methods:
 *   - `LarkClient.fromCfg(cfg, accountId)` — resolve account from config
 *   - `LarkClient.fromAccount(account)` — from a pre-resolved account
 *   - `LarkClient.fromCredentials(credentials)` — ephemeral instance (not cached)
 */
import * as Lark from '@larksuiteoapi/node-sdk';
import type { ClawdbotConfig, PluginRuntime } from 'openclaw/plugin-sdk';
import type { MessageDedup } from '../messaging/inbound/dedup';
import type { FeishuProbeResult, LarkAccount, LarkBrand } from './types';
/** Credential set accepted by the ephemeral `fromCredentials` factory. */
export interface LarkClientCredentials {
    accountId?: string;
    appId?: string;
    appSecret?: string;
    brand?: LarkBrand;
}
export declare class LarkClient {
    readonly account: LarkAccount;
    private _sdk;
    private _wsClient;
    private _botOpenId;
    private _botName;
    private _lastProbeResult;
    private _lastProbeAt;
    /** Attached message deduplicator — disposed together with the client. */
    messageDedup: MessageDedup | null;
    /** Persist the runtime instance for later retrieval (activate 阶段调用一次). */
    static setRuntime(runtime: PluginRuntime): void;
    /** Retrieve the stored runtime instance. Throws if not yet initialised. */
    static get runtime(): PluginRuntime;
    private static _globalConfig;
    /** Store the original global config (called during monitor startup). */
    static setGlobalConfig(cfg: ClawdbotConfig): void;
    /** Retrieve the stored global config, or `null` if not yet set. */
    static get globalConfig(): ClawdbotConfig | null;
    private constructor();
    /** Shorthand for `this.account.accountId`. */
    get accountId(): string;
    /** Resolve account from config and return a cached `LarkClient`. */
    static fromCfg(cfg: ClawdbotConfig, accountId?: string): LarkClient;
    /**
     * Get (or create) a cached `LarkClient` for the given account.
     * If the cached instance has stale credentials it is replaced.
     */
    static fromAccount(account: LarkAccount): LarkClient;
    /**
     * Create an ephemeral `LarkClient` from bare credentials.
     * The instance is **not** added to the global cache — suitable for
     * one-off probe / diagnose calls that should not pollute account state.
     */
    static fromCredentials(credentials: LarkClientCredentials): LarkClient;
    /** Look up a cached instance by accountId. */
    static get(accountId: string): LarkClient | null;
    /**
     * Dispose one or all cached instances.
     * With `accountId` — dispose that single instance.
     * Without — dispose every cached instance and clear the cache.
     */
    static clearCache(accountId?: string): Promise<void>;
    /** Lazily-created Lark SDK client. */
    get sdk(): Lark.Client;
    /**
     * Probe bot identity via the `bot/v1/openclaw_bot/ping` API.
     * Results are cached on the instance for subsequent access via
     * `botOpenId` / `botName`.
     */
    probe(opts?: {
        maxAgeMs?: number;
        needBotInfo?: boolean;
    }): Promise<FeishuProbeResult>;
    /** Cached bot open_id (available after `probe()` or `startWS()`). */
    get botOpenId(): string | undefined;
    /** Cached bot name (available after `probe()` or `startWS()`). */
    get botName(): string | undefined;
    /**
     * Start WebSocket event monitoring.
     *
     * Flow: probe bot identity → EventDispatcher → WSClient → start.
     * The returned Promise resolves when `abortSignal` fires.
     */
    startWS(opts: {
        handlers: Record<string, (data: unknown) => Promise<void>>;
        abortSignal?: AbortSignal;
        autoProbe?: boolean;
    }): Promise<void>;
    /** Whether a WebSocket client is currently active. */
    get wsConnected(): boolean;
    /** Disconnect WebSocket but keep instance in cache. */
    disconnect(): void;
    /** Disconnect + remove from cache. */
    dispose(): void;
    /** Assert credentials exist or throw. */
    private requireCredentials;
    /**
     * Start the WSClient and return a promise that resolves when the
     * abort signal fires (or immediately if already aborted).
     */
    private waitForAbort;
}
/**
 * Returns the best available config for account resolution.
 *
 * Priority: live config (has `channels.feishu`) > fallback (has
 * `channels.feishu`) > live config (last resort).
 *
 * The `config` object captured in tool-registration closures may be stale
 * after a hot-reload, so we prefer the live config from
 * `LarkClient.runtime.config.loadConfig()`.  However, `loadConfig()` may
 * return `{}` when the runtime config snapshot has been cleared (e.g. in
 * isolated cron sessions), so we fall back to the closure-captured config
 * when the live result lacks Feishu credentials.
 *
 * @param fallback - Config to use when the runtime is not yet initialised
 *   or when `loadConfig()` returns an incomplete config.
 */
export declare function getResolvedConfig(fallback: ClawdbotConfig): ClawdbotConfig;
