"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Side-effect functions for the inbound message gate.
 *
 * Extracted from gate.ts to separate pure policy decisions from I/O
 * operations (pairing request creation, message sending).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPairingReply = sendPairingReply;
const lark_client_1 = require("../../core/lark-client.js");
const send_1 = require("../outbound/send.js");
// ---------------------------------------------------------------------------
// Pairing reply
// ---------------------------------------------------------------------------
/**
 * Create a pairing request and send a pairing reply message to the user.
 *
 * This is the side-effect portion of the DM pairing gate: the pure
 * policy decision (whether to pair) is made in gate.ts, and this
 * function executes the resulting I/O.
 */
async function sendPairingReply(params) {
    const { senderId, chatId, accountId, accountScopedCfg } = params;
    const core = lark_client_1.LarkClient.runtime;
    const { code } = await core.channel.pairing.upsertPairingRequest({
        channel: 'feishu',
        id: senderId,
        accountId,
    });
    const pairingReply = core.channel.pairing.buildPairingReply({
        channel: 'feishu',
        idLine: senderId,
        code,
    });
    if (accountScopedCfg) {
        await (0, send_1.sendMessageFeishu)({
            cfg: accountScopedCfg,
            to: chatId,
            text: pairingReply,
            accountId,
        });
    }
}
