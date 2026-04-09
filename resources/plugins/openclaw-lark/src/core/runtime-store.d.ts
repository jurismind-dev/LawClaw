/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Shared runtime store for the Feishu plugin.
 *
 * Allows modules such as the logger to access the plugin runtime without
 * importing LarkClient directly, which would otherwise create static cycles.
 */
import type { PluginRuntime } from 'openclaw/plugin-sdk';
export declare function setLarkRuntime(nextRuntime: PluginRuntime): void;
export declare function tryGetLarkRuntime(): PluginRuntime | null;
export declare function getLarkRuntime(): PluginRuntime;
