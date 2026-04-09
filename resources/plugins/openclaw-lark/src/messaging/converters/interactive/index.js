"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Entry point for the interactive (card) message converter.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertInteractive = void 0;
const utils_1 = require("../utils.js");
const card_converter_1 = require("./card-converter.js");
const legacy_1 = require("./legacy.js");
const convertInteractive = (raw) => {
    const parsed = (0, utils_1.safeParse)(raw);
    if (!parsed) {
        return { content: '[interactive card]', resources: [] };
    }
    if (typeof parsed.json_card === 'string') {
        const converter = new card_converter_1.CardConverter(card_converter_1.MODE.Concise);
        const result = converter.convert(parsed);
        return { content: result.content || '[interactive card]', resources: [] };
    }
    return (0, legacy_1.convertLegacyCard)(parsed);
};
exports.convertInteractive = convertInteractive;
