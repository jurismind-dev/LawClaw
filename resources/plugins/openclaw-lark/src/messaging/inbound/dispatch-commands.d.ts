/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * System command and permission notification dispatch for inbound messages.
 *
 * Handles control commands (/help, /reset, etc.) via plain-text delivery
 * and permission-error notifications via the streaming card flow.
 */
import type { DispatchContext } from './dispatch-context';
import type { PermissionError } from './permission';
import { LarkClient } from '../../core/lark-client';
/**
 * Dispatch a permission-error notification to the agent so it can
 * inform the user about the missing Feishu API scope.
 */
export declare function dispatchPermissionNotification(dc: DispatchContext, permissionError: PermissionError, replyToMessageId?: string): Promise<void>;
/**
 * Dispatch a system command (/help, /reset, etc.) via plain-text delivery.
 * No streaming card, no "Processing..." state.
 *
 * When `suppressReply` is true the agent still runs (e.g. reads workspace
 * files) but its text output is not forwarded to Feishu.  This is used for
 * bare /new and /reset commands: the SDK already sends a "done" notice
 * via its own route, so the AI greeting would be redundant.
 */
export declare function dispatchSystemCommand(dc: DispatchContext, ctxPayload: ReturnType<typeof LarkClient.runtime.channel.reply.finalizeInboundContext>, suppressReply?: boolean, replyToMessageId?: string): Promise<void>;
