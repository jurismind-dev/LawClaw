/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * OpenClaw Lark/Feishu plugin entry point.
 *
 * Registers the Feishu channel and all tool families:
 * doc, wiki, drive, perm, bitable, task, calendar.
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export { monitorFeishuProvider } from './src/channel/monitor';
export { sendMessageFeishu, sendCardFeishu, updateCardFeishu, editMessageFeishu } from './src/messaging/outbound/send';
export { getMessageFeishu } from './src/messaging/outbound/fetch';
export { uploadImageLark, uploadFileLark, sendImageLark, sendFileLark, sendAudioLark, uploadAndSendMediaLark, } from './src/messaging/outbound/media';
export { sendTextLark, sendCardLark, sendMediaLark, type SendTextLarkParams, type SendCardLarkParams, type SendMediaLarkParams, } from './src/messaging/outbound/deliver';
export { type FeishuChannelData } from './src/messaging/outbound/outbound';
export { probeFeishu } from './src/channel/probe';
export { addReactionFeishu, removeReactionFeishu, listReactionsFeishu, FeishuEmoji, VALID_FEISHU_EMOJI_TYPES, } from './src/messaging/outbound/reactions';
export { forwardMessageFeishu } from './src/messaging/outbound/forward';
export { updateChatFeishu, addChatMembersFeishu, removeChatMembersFeishu, listChatMembersFeishu, } from './src/messaging/outbound/chat-manage';
export { feishuMessageActions } from './src/messaging/outbound/actions';
export { mentionedBot, nonBotMentions, extractMessageBody, formatMentionForText, formatMentionForCard, formatMentionAllForText, formatMentionAllForCard, buildMentionedMessage, buildMentionedCardContent, type MentionInfo, } from './src/messaging/inbound/mention';
export { feishuPlugin } from './src/channel/plugin';
export type { MessageContext, RawMessage, RawSender, FeishuMessageContext, FeishuReactionCreatedEvent, } from './src/messaging/types';
export { handleFeishuReaction } from './src/messaging/inbound/reaction-handler';
export { parseMessageEvent } from './src/messaging/inbound/parse';
export { checkMessageGate } from './src/messaging/inbound/gate';
export { isMessageExpired } from './src/messaging/inbound/dedup';
declare const plugin: {
    id: string;
    name: string;
    description: string;
    configSchema: any;
    register(api: OpenClawPluginApi): void;
};
export default plugin;
