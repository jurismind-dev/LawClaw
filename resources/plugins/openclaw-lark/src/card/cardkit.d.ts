/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * CardKit streaming APIs for Lark/Feishu.
 */
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
import type { FeishuSendResult } from '../messaging/types';
/**
 * Create a card entity via the CardKit API.
 *
 * Returns the card_id directly, bypassing the idConvert step.
 * The card can then be sent via IM API and streamed via CardKit.
 */
export declare function createCardEntity(params: {
    cfg: ClawdbotConfig;
    card: Record<string, unknown>;
    accountId?: string;
}): Promise<string | null>;
/**
 * Stream text content to a specific card element using the CardKit API.
 *
 * The card automatically diffs the new content against the previous
 * content and renders incremental changes with a typewriter animation.
 *
 * @param params.cardId    - CardKit card ID (from `convertMessageToCardId`).
 * @param params.elementId - The element ID to update (e.g. `STREAMING_ELEMENT_ID`).
 * @param params.content   - The full cumulative text (not a delta).
 * @param params.sequence  - Monotonically increasing sequence number.
 */
export declare function streamCardContent(params: {
    cfg: ClawdbotConfig;
    cardId: string;
    elementId: string;
    content: string;
    sequence: number;
    accountId?: string;
}): Promise<void>;
/**
 * Fully replace a card using the CardKit API.
 *
 * Used for the final "complete" state update (with action buttons, green
 * header, etc.) after streaming finishes.
 *
 * @param params.cardId   - CardKit card ID.
 * @param params.card     - The new card JSON content.
 * @param params.sequence - Monotonically increasing sequence number.
 */
export declare function updateCardKitCard(params: {
    cfg: ClawdbotConfig;
    cardId: string;
    card: Record<string, unknown>;
    sequence: number;
    accountId?: string;
}): Promise<void>;
export declare function updateCardKitCardForAuth(params: {
    cfg: ClawdbotConfig;
    cardId: string;
    card: Record<string, unknown>;
    sequence: number;
    accountId?: string;
}): Promise<void>;
/**
 * Send an interactive card message by referencing a CardKit card_id.
 *
 * The content format is: {"type":"card","data":{"card_id":"xxx"}}
 * This links the IM message to the CardKit card entity, enabling
 * streaming updates via cardElement.content().
 */
export declare function sendCardByCardId(params: {
    cfg: ClawdbotConfig;
    to: string;
    cardId: string;
    replyToMessageId?: string;
    replyInThread?: boolean;
    accountId?: string;
}): Promise<FeishuSendResult>;
/**
 * Close (or open) the streaming mode on a CardKit card.
 *
 * Must be called after streaming is complete to restore normal card
 * behaviour (forwarding, interaction callbacks, etc.).
 */
export declare function setCardStreamingMode(params: {
    cfg: ClawdbotConfig;
    cardId: string;
    streamingMode: boolean;
    sequence: number;
    accountId?: string;
}): Promise<void>;
