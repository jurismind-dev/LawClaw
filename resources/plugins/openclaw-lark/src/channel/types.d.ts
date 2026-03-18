/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Channel type definitions for the Lark/Feishu channel plugin.
 */
import type { ClawdbotConfig, RuntimeEnv, HistoryEntry } from 'openclaw/plugin-sdk';
import type { LarkClient } from '../core/lark-client';
import type { MessageDedup } from '../messaging/inbound/dedup';
export type { FeishuProbeResult } from '../core/types';
export interface MonitorFeishuOpts {
    config?: ClawdbotConfig;
    runtime?: RuntimeEnv;
    abortSignal?: AbortSignal;
    accountId?: string;
}
export interface FeishuDirectoryPeer {
    kind: 'user';
    id: string;
    name?: string;
}
export interface FeishuDirectoryGroup {
    kind: 'group';
    id: string;
    name?: string;
}
export interface MonitorContext {
    cfg: ClawdbotConfig;
    lark: LarkClient;
    accountId: string;
    chatHistories: Map<string, HistoryEntry[]>;
    messageDedup: MessageDedup;
    runtime?: RuntimeEnv;
    log: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
}
