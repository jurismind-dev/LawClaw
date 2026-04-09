/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * System command and permission notification dispatch for inbound messages.
 *
 * Handles control commands (/help, /reset, etc.) via plain-text delivery
 * and permission-error notifications via the streaming card flow.
 */
import type { LarkClient } from '../../core/lark-client';
import type { PermissionError } from './permission';
import type { DispatchContext } from './dispatch-context';
/**
 * Dispatch a permission-error notification to the agent so it can
 * inform the user about the missing Feishu API scope.
 */
export declare function dispatchPermissionNotification(dc: DispatchContext, permissionError: PermissionError, replyToMessageId?: string): Promise<void>;
/**
 * Dispatch a system command (/help, /reset, etc.) via plain-text delivery.
 * No streaming card, no "Processing..." state.
 */
export declare function dispatchSystemCommand(dc: DispatchContext, ctxPayload: ReturnType<typeof LarkClient.runtime.channel.reply.finalizeInboundContext>, replyToMessageId?: string): Promise<void>;
