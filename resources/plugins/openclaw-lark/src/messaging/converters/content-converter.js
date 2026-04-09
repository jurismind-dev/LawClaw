"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Content converter for Feishu messages.
 *
 * Each message type (text, post, image, etc.) has a dedicated converter
 * function that parses raw JSON content into an AI-friendly text
 * representation plus a list of resource descriptors.
 *
 * This module is a general-purpose message parsing utility — usable
 * from inbound handling, outbound formatting, and skills.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveMentions = exports.extractMentionOpenId = exports.buildConvertContextFromItem = void 0;
exports.convertMessageContent = convertMessageContent;
const index_1 = require("./index.js");
var content_converter_helpers_1 = require("./content-converter-helpers.js");
Object.defineProperty(exports, "buildConvertContextFromItem", { enumerable: true, get: function () { return content_converter_helpers_1.buildConvertContextFromItem; } });
Object.defineProperty(exports, "extractMentionOpenId", { enumerable: true, get: function () { return content_converter_helpers_1.extractMentionOpenId; } });
Object.defineProperty(exports, "resolveMentions", { enumerable: true, get: function () { return content_converter_helpers_1.resolveMentions; } });
// ---------------------------------------------------------------------------
// Convert
// ---------------------------------------------------------------------------
/**
 * Convert raw message content using the converter for the given message
 * type. Falls back to the "unknown" converter for unrecognised types.
 *
 * Returns a Promise because some converters (e.g. merge_forward) perform
 * async operations. Synchronous converters are awaited transparently.
 */
async function convertMessageContent(raw, messageType, ctx) {
    const fn = index_1.converters.get(messageType) ?? index_1.converters.get('unknown');
    if (!fn) {
        return { content: raw, resources: [] };
    }
    const nextCtx = ctx.convertMessageContent ? ctx : { ...ctx, convertMessageContent };
    return fn(raw, nextCtx);
}
