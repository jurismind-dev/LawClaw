/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Policy gate for inbound Feishu messages.
 *
 * Determines whether a parsed message should be processed or rejected
 * based on group/DM access policies, sender allowlists, and mention
 * requirements.
 *
 * Group access follows the same two-layer model as Telegram:
 *
 *   Layer 1 – Which GROUPS are allowed (SDK `resolveGroupPolicy`):
 *     - No `groups` configured + `groupPolicy: "open"` → any group passes
 *     - `groupPolicy: "allowlist"` or `groups` configured → acts as allowlist
 *       (explicit group IDs or `"*"` wildcard)
 *     - `groupPolicy: "disabled"` → all groups blocked
 *
 *   Layer 2 – Which SENDERS are allowed within a group:
 *     - Per-group `groupPolicy` overrides global for sender filtering
 *     - `groupAllowFrom` (global) + per-group `allowFrom` are merged
 *     - `"open"` → any sender; `"allowlist"` → check merged list;
 *       `"disabled"` → block all senders
 */
import type { ClawdbotConfig, HistoryEntry } from 'openclaw/plugin-sdk';
import type { MessageContext } from '../types';
import type { FeishuConfig } from '../../core/types';
import type { LarkAccount } from '../../core/types';
/**
 * Read the pairing allowFrom store for the Feishu channel via the SDK runtime.
 */
declare function readAllowFromStore(accountId: string): Promise<string[]>;
export interface GateResult {
    allowed: boolean;
    reason?: string;
    /** When a group message is rejected due to missing bot mention, the
     *  caller should record this entry into the chat history map. */
    historyEntry?: HistoryEntry;
}
/**
 * Read the pairing allowFrom store for the Feishu channel.
 *
 * Exported so that handler.ts can provide it as a closure to the SDK's
 * `resolveSenderCommandAuthorization` helper.
 */
export { readAllowFromStore as readFeishuAllowFromStore };
/**
 * Check whether an inbound message passes all access-control gates.
 *
 * The DM gate is async because it may read from the pairing store
 * and send pairing request messages.
 */
export declare function checkMessageGate(params: {
    ctx: MessageContext;
    accountFeishuCfg?: FeishuConfig;
    account: LarkAccount;
    /** account 级别的 ClawdbotConfig（channels.feishu 已替换为 per-account 合并后的配置） */
    accountScopedCfg?: ClawdbotConfig;
    log: (...args: unknown[]) => void;
}): Promise<GateResult>;
