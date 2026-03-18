/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * 消息不可用（已撤回/已删除）状态管理。
 *
 * 目标：
 * 1) 当命中飞书终止错误码（230011/231003）时，按 message_id 标记不可用；
 * 2) 后续针对该 message_id 的 API 调用直接短路，避免持续报错刷屏。
 */
import { LARK_ERROR } from './auth-errors';
export type TerminalMessageApiCode = typeof LARK_ERROR.MESSAGE_RECALLED | typeof LARK_ERROR.MESSAGE_DELETED;
export interface MessageUnavailableState {
    apiCode: TerminalMessageApiCode;
    markedAtMs: number;
    operation?: string;
}
export declare function isTerminalMessageApiCode(code: unknown): code is TerminalMessageApiCode;
export declare function markMessageUnavailable(params: {
    messageId: string;
    apiCode: TerminalMessageApiCode;
    operation?: string;
}): void;
export declare function getMessageUnavailableState(messageId: string | undefined): MessageUnavailableState | undefined;
export declare function isMessageUnavailable(messageId: string | undefined): boolean;
export declare function markMessageUnavailableFromError(params: {
    messageId: string | undefined;
    error: unknown;
    operation?: string;
}): TerminalMessageApiCode | undefined;
export declare class MessageUnavailableError extends Error {
    readonly messageId: string;
    readonly apiCode: TerminalMessageApiCode;
    readonly operation?: string;
    constructor(params: {
        messageId: string;
        apiCode: TerminalMessageApiCode;
        operation?: string;
    });
}
export declare function isMessageUnavailableError(error: unknown): error is MessageUnavailableError;
export declare function assertMessageAvailable(messageId: string | undefined, operation?: string): void;
/**
 * 针对 message_id 的统一保护：
 * - 调用前检查是否已标记不可用；
 * - 调用报错后识别 230011/231003 并标记；
 * - 命中时抛出 MessageUnavailableError 供上游快速终止流程。
 */
export declare function runWithMessageUnavailableGuard<T>(params: {
    messageId: string | undefined;
    operation: string;
    fn: () => Promise<T>;
}): Promise<T>;
