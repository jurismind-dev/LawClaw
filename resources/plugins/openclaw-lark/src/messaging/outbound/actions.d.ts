/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * ChannelMessageActionAdapter for the Lark/Feishu channel plugin.
 *
 * Implements the standard message-action interface so the framework's
 * built-in `message` tool can route send, react, delete and other
 * actions to Feishu.
 *
 * The `send` action is the unified entry-point for text, card, media,
 * reply and attachment delivery — matching the Telegram/Discord pattern
 * where a single action handles all outbound message types.
 */
import type { ChannelMessageActionAdapter } from 'openclaw/plugin-sdk';
export declare const feishuMessageActions: ChannelMessageActionAdapter;
