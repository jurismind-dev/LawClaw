"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Message fetching re-exports for backward compatibility.
 *
 * The actual implementations have been moved to:
 * - `getMessageFeishu` / `FeishuMessageInfo` → `../shared/message-lookup.ts`
 * - `getChatTypeFeishu` → `../../core/chat-info-cache.ts`
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChatTypeFeishu = exports.getMessageFeishu = void 0;
var message_lookup_1 = require("../shared/message-lookup.js");
Object.defineProperty(exports, "getMessageFeishu", { enumerable: true, get: function () { return message_lookup_1.getMessageFeishu; } });
var chat_info_cache_1 = require("../../core/chat-info-cache.js");
Object.defineProperty(exports, "getChatTypeFeishu", { enumerable: true, get: function () { return chat_info_cache_1.getChatTypeFeishu; } });
