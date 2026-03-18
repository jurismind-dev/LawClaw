/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Event handlers for the Feishu WebSocket monitor.
 *
 * Extracted from monitor.ts to improve testability and reduce
 * function size. Each handler receives a MonitorContext with all
 * dependencies needed to process the event.
 */
import type { MonitorContext } from './types';
export declare function handleMessageEvent(ctx: MonitorContext, data: unknown): Promise<void>;
export declare function handleReactionEvent(ctx: MonitorContext, data: unknown): Promise<void>;
export declare function handleBotMembershipEvent(ctx: MonitorContext, data: unknown, action: 'added' | 'removed'): Promise<void>;
export declare function handleCardActionEvent(ctx: MonitorContext, data: unknown): Promise<unknown>;
