/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Resolution logic for Feishu tool-use display.
 *
 * The source of truth is OpenClaw's effective verbose state:
 * inline `/verbose` override > session store override > config default.
 * Feishu channel config only retains UI-level detail (`showFullPaths`).
 */
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
import type { FeishuConfig } from '../core/types';
export type ToolUseMode = 'off' | 'on' | 'full';
export interface ToolUseDisplayConfig {
    mode: ToolUseMode;
    showToolUse: boolean;
    showToolResultDetails: boolean;
    showFullPaths: boolean;
}
export declare function resolveToolUseDisplayConfig(params: {
    cfg: ClawdbotConfig;
    feishuCfg: FeishuConfig | undefined;
    agentId: string;
    sessionKey: string;
    body?: string;
}): ToolUseDisplayConfig;
