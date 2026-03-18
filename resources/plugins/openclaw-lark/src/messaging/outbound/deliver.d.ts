/**
 * Standalone text and media delivery functions for the Lark/Feishu channel.
 *
 * These functions operate directly on the Lark SDK without depending on
 * {@link sendMessageFeishu} from `send.ts`. The outbound adapter delegates
 * to these for its `sendText` and `sendMedia` implementations.
 */
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
import type { FeishuSendResult } from '../types';
/**
 * Parameters for sending a text message via Feishu.
 */
export interface SendTextLarkParams {
    /** Plugin configuration. */
    cfg: ClawdbotConfig;
    /** Target identifier (chat_id, open_id, or user_id). */
    to: string;
    /** Message text content (supports Feishu markdown subset). */
    text: string;
    /** When set, the message is sent as a threaded reply. */
    replyToMessageId?: string;
    /** When true, the reply appears in the thread instead of main chat. */
    replyInThread?: boolean;
    /** Optional account identifier for multi-account setups. */
    accountId?: string;
}
/**
 * Send a text message to a Feishu chat or user.
 *
 * Standalone implementation that directly operates the Lark SDK.
 * The text is pre-processed (table conversion, style optimization)
 * and sent as a Feishu "post" message with markdown rendering.
 *
 * If the entire text is a valid Feishu card JSON string (v1 or v2),
 * it is automatically detected and routed to {@link sendCardLark}
 * instead of being sent as plain text.
 *
 * @param params - See {@link SendTextLarkParams}.
 * @returns The message ID and chat ID.
 * @throws {Error} When the target is invalid or the API call fails.
 *
 * @example
 * ```ts
 * const result = await sendTextLark({
 *   cfg,
 *   to: "oc_xxx",
 *   text: "Hello from Feishu",
 * });
 * ```
 */
export declare function sendTextLark(params: SendTextLarkParams): Promise<FeishuSendResult>;
/**
 * Parameters for sending an interactive card message via Feishu.
 */
export interface SendCardLarkParams {
    /** Plugin configuration. */
    cfg: ClawdbotConfig;
    /** Target identifier (chat_id, open_id, or user_id). */
    to: string;
    /**
     * Complete card JSON object (v1 Message Card or v2 CardKit).
     *
     * - **v1**: top-level `config`, `header`, `elements`.
     * - **v2**: `schema: "2.0"`, `config`, `header`, `body.elements`.
     *
     * The Feishu server determines the version by the presence of
     * `schema: "2.0"`.
     */
    card: Record<string, unknown>;
    /** When set, the card is sent as a threaded reply. */
    replyToMessageId?: string;
    /** When true, the reply appears in the thread instead of main chat. */
    replyInThread?: boolean;
    /** Optional account identifier for multi-account setups. */
    accountId?: string;
}
/**
 * Send an interactive card message to a Feishu chat or user.
 *
 * Supports both v1 (Message Card) and v2 (CardKit) card formats.
 * The card JSON is serialised and sent as `msg_type: "interactive"`.
 *
 * @param params - See {@link SendCardLarkParams}.
 * @returns The message ID and chat ID.
 * @throws {Error} When the target is invalid or the API call fails.
 *
 * @example
 * ```ts
 * // v1 card
 * const result = await sendCardLark({
 *   cfg,
 *   to: "oc_xxx",
 *   card: {
 *     config: { wide_screen_mode: true },
 *     header: { title: { tag: "plain_text", content: "Hello" }, template: "blue" },
 *     elements: [{ tag: "div", text: { tag: "lark_md", content: "world" } }],
 *   },
 * });
 *
 * // v2 card
 * const result2 = await sendCardLark({
 *   cfg,
 *   to: "oc_xxx",
 *   card: {
 *     schema: "2.0",
 *     config: { wide_screen_mode: true },
 *     body: { elements: [{ tag: "markdown", content: "Hello **world**" }] },
 *   },
 * });
 * ```
 */
export declare function sendCardLark(params: SendCardLarkParams): Promise<FeishuSendResult>;
/**
 * Parameters for sending a single media message via Feishu.
 */
export interface SendMediaLarkParams {
    /** Plugin configuration. */
    cfg: ClawdbotConfig;
    /** Target identifier (chat_id, open_id, or user_id). */
    to: string;
    /** Media URL to upload and send. */
    mediaUrl: string;
    /** When set, the message is sent as a threaded reply. */
    replyToMessageId?: string;
    /** When true, the reply appears in the thread instead of main chat. */
    replyInThread?: boolean;
    /** Optional account identifier for multi-account setups. */
    accountId?: string;
    /** Allowed root directories for local file access (SSRF prevention). */
    mediaLocalRoots?: readonly string[];
}
/**
 * Send a single media message to a Feishu chat or user.
 *
 * Pure atomic operation — uploads the media and sends it. On upload
 * failure, falls back to sending the URL as a clickable text link.
 *
 * This function does **not** handle leading text or multi-media
 * orchestration; those concerns belong to the adapter's `sendMedia`
 * and `sendPayload` methods.
 *
 * @param params - See {@link SendMediaLarkParams}.
 * @returns The message ID and chat ID of the sent message.
 * @throws {Error} When the target is invalid or all send attempts fail.
 *
 * @example
 * ```ts
 * const result = await sendMediaLark({
 *   cfg,
 *   to: "oc_xxx",
 *   mediaUrl: "https://example.com/image.png",
 * });
 * ```
 */
export declare function sendMediaLark(params: SendMediaLarkParams): Promise<FeishuSendResult>;
