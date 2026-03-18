/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Dispatch context construction for the inbound agent dispatch pipeline.
 *
 * Derives all shared values needed by downstream dispatch helpers:
 * logging, addressing, route resolution, thread session, and system
 * event emission.
 */
import type { ClawdbotConfig, RuntimeEnv } from 'openclaw/plugin-sdk';
import type { MessageContext } from '../types';
import type { LarkAccount } from '../../core/types';
import { LarkClient } from '../../core/lark-client';
export interface DispatchContext {
    ctx: MessageContext;
    /** account 级别的 ClawdbotConfig（channels.feishu 已替换为 per-account 合并后的配置） */
    accountScopedCfg: ClawdbotConfig;
    account: LarkAccount;
    runtime: RuntimeEnv;
    log: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    core: typeof LarkClient.runtime;
    isGroup: boolean;
    isThread: boolean;
    feishuFrom: string;
    feishuTo: string;
    envelopeFrom: string;
    envelopeOptions: ReturnType<typeof LarkClient.runtime.channel.reply.resolveEnvelopeFormatOptions>;
    route: ReturnType<typeof LarkClient.runtime.channel.routing.resolveAgentRoute>;
    threadSessionKey?: string;
    commandAuthorized?: boolean;
}
/**
 * Provide a safe RuntimeEnv fallback when the caller did not supply one.
 * Replaces the previous unsafe `runtime as RuntimeEnv` casts.
 */
export declare function ensureRuntime(runtime: RuntimeEnv | undefined): RuntimeEnv;
/**
 * Derive all shared values needed by downstream helpers:
 * logging, addressing, route resolution, and system event emission.
 */
export declare function buildDispatchContext(params: {
    ctx: MessageContext;
    account: LarkAccount;
    accountScopedCfg: ClawdbotConfig;
    runtime?: RuntimeEnv;
    commandAuthorized?: boolean;
}): DispatchContext;
/**
 * Resolve thread session key for thread-capable groups.
 *
 * Returns a thread-scoped session key when ALL conditions are met:
 *   1. `threadSession` config is enabled on the account
 *   2. The group is a topic group (chat_mode=topic) or uses thread
 *      message mode (group_message_type=thread)
 *
 * The group info is fetched via `im.chat.get` with a 1-hour LRU cache
 * to minimise OAPI calls.
 */
export declare function resolveThreadSessionKey(params: {
    accountScopedCfg: ClawdbotConfig;
    account: LarkAccount;
    chatId: string;
    threadId: string;
    baseSessionKey: string;
}): Promise<string | undefined>;
