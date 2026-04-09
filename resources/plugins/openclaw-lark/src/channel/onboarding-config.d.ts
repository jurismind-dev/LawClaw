/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Onboarding configuration mutation helpers.
 *
 * Pure functions that apply Feishu channel configuration changes
 * to a ClawdbotConfig. Extracted from onboarding.ts for reuse
 * in CLI commands and other configuration flows.
 */
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
import type { DmPolicy } from 'openclaw/plugin-sdk/setup';
export declare function setFeishuDmPolicy(cfg: ClawdbotConfig, dmPolicy: DmPolicy): ClawdbotConfig;
export declare function setFeishuAllowFrom(cfg: ClawdbotConfig, allowFrom: string[]): ClawdbotConfig;
export declare function setFeishuGroupPolicy(cfg: ClawdbotConfig, groupPolicy: 'open' | 'allowlist' | 'disabled'): ClawdbotConfig;
export declare function setFeishuGroupAllowFrom(cfg: ClawdbotConfig, groupAllowFrom: string[]): ClawdbotConfig;
export declare function setFeishuGroups(cfg: ClawdbotConfig, groups: Record<string, object>): ClawdbotConfig;
export declare function parseAllowFromInput(raw: string): string[];
