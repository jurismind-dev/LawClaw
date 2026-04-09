"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * OAPI Tools Index
 *
 * This module registers all tools that directly use Feishu Open API (OAPI).
 * These tools are placed here to distinguish them from MCP-based tools.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerOapiTools = registerOapiTools;
const index_1 = require("../tat/im/index.js");
const index_2 = require("./calendar/index.js");
const index_3 = require("./task/index.js");
const index_4 = require("./bitable/index.js");
const index_5 = require("./common/index.js");
// import { registerFeishuMailTools } from "./mail/index";
const index_6 = require("./search/index.js");
const index_7 = require("./drive/index.js");
const index_8 = require("./wiki/index.js");
const index_9 = require("./sheets/index.js");
// import { registerFeishuOkrTools } from "./okr/index";
const index_10 = require("./chat/index.js");
const index_11 = require("./im/index.js");
function registerOapiTools(api) {
    // Common tools
    (0, index_5.registerGetUserTool)(api);
    (0, index_5.registerSearchUserTool)(api);
    // Chat tools
    (0, index_10.registerFeishuChatTools)(api);
    // IM tools (user identity)
    (0, index_11.registerFeishuImTools)(api);
    // Calendar tools
    (0, index_2.registerFeishuCalendarCalendarTool)(api);
    (0, index_2.registerFeishuCalendarEventTool)(api);
    (0, index_2.registerFeishuCalendarEventAttendeeTool)(api);
    (0, index_2.registerFeishuCalendarFreebusyTool)(api);
    // Task tools
    (0, index_3.registerFeishuTaskTaskTool)(api);
    (0, index_3.registerFeishuTaskTasklistTool)(api);
    (0, index_3.registerFeishuTaskSectionTool)(api);
    (0, index_3.registerFeishuTaskCommentTool)(api);
    (0, index_3.registerFeishuTaskSubtaskTool)(api);
    // Bitable tools
    (0, index_4.registerFeishuBitableAppTool)(api);
    (0, index_4.registerFeishuBitableAppTableTool)(api);
    (0, index_4.registerFeishuBitableAppTableRecordTool)(api);
    (0, index_4.registerFeishuBitableAppTableFieldTool)(api);
    (0, index_4.registerFeishuBitableAppTableViewTool)(api);
    // Search tools
    (0, index_6.registerFeishuSearchTools)(api);
    // Drive tools
    (0, index_7.registerFeishuDriveTools)(api);
    // Wiki tools
    (0, index_8.registerFeishuWikiTools)(api);
    // Sheets tools
    (0, index_9.registerFeishuSheetsTools)(api);
    // IM tools (bot identity)
    (0, index_1.registerFeishuImTools)(api);
    api.logger.debug?.('Registered all OAPI tools (calendar, task, bitable, search, drive, wiki, sheets, im)');
}
