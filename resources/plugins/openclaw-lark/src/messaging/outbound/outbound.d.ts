/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Outbound message adapter for the Lark/Feishu channel plugin.
 *
 * Exposes a `ChannelOutboundAdapter` that the OpenClaw core uses to deliver
 * agent-generated replies back to Feishu chats. The adapter translates SDK
 * parameters and delegates to standalone sending functions.
 */
import type { ChannelOutboundAdapter } from 'openclaw/plugin-sdk';
/**
 * Channel-specific payload for Feishu, carried in `ReplyPayload.channelData.feishu`.
 *
 * Callers (skills, tools, programmatic code) populate this structure to send
 * Feishu-native content that the standard text/media path cannot express.
 *
 * Both card v1 (Message Card) and v2 (CardKit) formats are supported.
 * The Feishu server distinguishes the version by the presence of `schema: "2.0"`.
 *
 * @example
 * ```ts
 * // --- v1 Message Card (default) ---
 * const v1Reply: ReplyPayload = {
 *   channelData: {
 *     feishu: {
 *       card: {
 *         config: { wide_screen_mode: true },
 *         header: {
 *           title: { tag: "plain_text", content: "Task Created" },
 *           template: "green",
 *         },
 *         elements: [
 *           { tag: "div", text: { tag: "lark_md", content: "**Title:** Fix login bug" } },
 *           { tag: "action", actions: [
 *             { tag: "button", text: { tag: "plain_text", content: "View" }, type: "primary", url: "https://..." },
 *           ]},
 *         ],
 *       },
 *     },
 *   },
 * };
 *
 * // --- v2 CardKit ---
 * const v2Reply: ReplyPayload = {
 *   channelData: {
 *     feishu: {
 *       card: {
 *         schema: "2.0",
 *         config: { wide_screen_mode: true },
 *         header: {
 *           title: { tag: "plain_text", content: "Task Created" },
 *           template: "green",
 *         },
 *         body: {
 *           elements: [
 *             { tag: "markdown", content: "**Title:** Fix login bug" },
 *           ],
 *         },
 *       },
 *     },
 *   },
 * };
 * ```
 */
export interface FeishuChannelData {
    /**
     * A complete Feishu interactive card JSON object (v1 or v2).
     *
     * The card is sent as-is via `msg_type: "interactive"`. The Feishu server
     * uses the presence of `schema: "2.0"` to determine the card version.
     *
     * **v1 (Message Card)** — default when no `schema` field is present.
     * Top-level fields: `config`, `header`, `elements`.
     * Element tags: `div`, `action`, `button`, `button_group`, `note`,
     * `img`, `hr`, `column_set`, `markdown` (limited), `lark_md` (in div.text).
     *
     * **v2 (CardKit)** — activated by `schema: "2.0"`.
     * Top-level fields: `schema`, `config`, `header`, `body.elements`.
     * Element tags: `markdown`, `plain_text`, `hr`, `collapsible_panel`,
     * `column_set`, `table`, `image`, `button`, `select_static`, `overflow`.
     * Not supported in v2: `action`, `button_group`, `note`, `div` + `lark_md`.
     *
     * @see https://open.larkoffice.com/document/feishu-cards/card-json-v2-structure (v2)
     * @see https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-components (v1)
     */
    card?: Record<string, unknown>;
}
export declare const feishuOutbound: ChannelOutboundAdapter;
