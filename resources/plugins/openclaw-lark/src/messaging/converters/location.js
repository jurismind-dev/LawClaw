"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "location" message type.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertLocation = void 0;
const utils_1 = require("./utils.js");
const convertLocation = (raw) => {
    const parsed = (0, utils_1.safeParse)(raw);
    const name = parsed?.name ?? '';
    const lat = parsed?.latitude ?? '';
    const lng = parsed?.longitude ?? '';
    const nameAttr = name ? ` name="${name}"` : '';
    const coordsAttr = lat && lng ? ` coords="lat:${lat},lng:${lng}"` : '';
    return {
        content: `<location${nameAttr}${coordsAttr}/>`,
        resources: [],
    };
};
exports.convertLocation = convertLocation;
