/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Side-effect functions for the inbound message gate.
 *
 * Extracted from gate.ts to separate pure policy decisions from I/O
 * operations (pairing request creation, message sending).
 */
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
/**
 * Create a pairing request and send a pairing reply message to the user.
 *
 * This is the side-effect portion of the DM pairing gate: the pure
 * policy decision (whether to pair) is made in gate.ts, and this
 * function executes the resulting I/O.
 */
export declare function sendPairingReply(params: {
    senderId: string;
    chatId: string;
    accountId: string;
    accountScopedCfg?: ClawdbotConfig;
}): Promise<void>;
