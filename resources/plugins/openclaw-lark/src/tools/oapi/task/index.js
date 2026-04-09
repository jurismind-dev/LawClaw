"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuTaskSectionTool = exports.registerFeishuTaskSubtaskTool = exports.registerFeishuTaskCommentTool = exports.registerFeishuTaskTasklistTool = exports.registerFeishuTaskTaskTool = void 0;
var task_1 = require("./task.js");
Object.defineProperty(exports, "registerFeishuTaskTaskTool", { enumerable: true, get: function () { return task_1.registerFeishuTaskTaskTool; } });
var tasklist_1 = require("./tasklist.js");
Object.defineProperty(exports, "registerFeishuTaskTasklistTool", { enumerable: true, get: function () { return tasklist_1.registerFeishuTaskTasklistTool; } });
var comment_1 = require("./comment.js");
Object.defineProperty(exports, "registerFeishuTaskCommentTool", { enumerable: true, get: function () { return comment_1.registerFeishuTaskCommentTool; } });
var subtask_1 = require("./subtask.js");
Object.defineProperty(exports, "registerFeishuTaskSubtaskTool", { enumerable: true, get: function () { return subtask_1.registerFeishuTaskSubtaskTool; } });
var section_1 = require("./section.js");
Object.defineProperty(exports, "registerFeishuTaskSectionTool", { enumerable: true, get: function () { return section_1.registerFeishuTaskSectionTool; } });
