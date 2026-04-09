"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSearchUserTool = exports.registerGetUserTool = void 0;
var get_user_1 = require("./get-user.js");
Object.defineProperty(exports, "registerGetUserTool", { enumerable: true, get: function () { return get_user_1.registerGetUserTool; } });
var search_user_1 = require("./search-user.js");
Object.defineProperty(exports, "registerSearchUserTool", { enumerable: true, get: function () { return search_user_1.registerSearchUserTool; } });
