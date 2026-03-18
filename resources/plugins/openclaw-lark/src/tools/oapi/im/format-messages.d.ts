/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * 消息格式化公共函数
 *
 * 将飞书 IM API 返回的原始消息对象转换为 AI 可读的 JSON 格式。
 * 由 feishu_im_user_get_messages 和 feishu_im_user_get_thread_messages 共享。
 *
 * 所有 API 调用均通过 UAT（用户身份）进行。
 */
import type { LarkAccount } from '../../../core/types';
import type { ToolClient } from '../../../core/tool-client';
import type { ApiMessageItem } from '../../../messaging/converters/types';
export interface FormattedMessage {
    message_id: string;
    msg_type: string;
    content: string;
    sender: {
        id: string;
        sender_type: string;
        name?: string;
    };
    create_time: string;
    /** 回复的消息 ID（parent_id）。有 thread_id 时省略，因为话题上下文可推断 */
    reply_to?: string;
    thread_id?: string;
    mentions?: Array<{
        key: string;
        id: string;
        name: string;
    }>;
    deleted: boolean;
    updated: boolean;
}
/**
 * 格式化单条消息对象。
 *
 * 使用 convertMessageContent 将 body.content 转为 AI 可读文本，
 * 并过滤掉 AI 不需要的字段（upper_message_id、tenant_key 等）。
 */
export declare function formatMessageItem(item: ApiMessageItem, accountId: string, nameResolver: (openId: string) => string | undefined, ctxOverrides?: Partial<import('../../../messaging/converters/types.js').ConvertContext>): Promise<FormattedMessage>;
/**
 * 批量格式化消息列表（UAT 路径）。
 *
 * 先批量解析所有 sender 的名字（写入 UAT 缓存），再逐条格式化。
 * 这样 formatMessageItem 中的 sender.name 和 converter 的
 * resolveUserName 都能从 UAT 缓存中读到名字。
 */
export declare function formatMessageList(items: ApiMessageItem[], account: LarkAccount, log: (...args: unknown[]) => void, client: ToolClient): Promise<FormattedMessage[]>;
