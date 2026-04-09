"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Onboarding configuration mutation helpers.
 *
 * Pure functions that apply Feishu channel configuration changes
 * to a ClawdbotConfig. Extracted from onboarding.ts for reuse
 * in CLI commands and other configuration flows.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setFeishuDmPolicy = setFeishuDmPolicy;
exports.setFeishuAllowFrom = setFeishuAllowFrom;
exports.setFeishuGroupPolicy = setFeishuGroupPolicy;
exports.setFeishuGroupAllowFrom = setFeishuGroupAllowFrom;
exports.setFeishuGroups = setFeishuGroups;
exports.parseAllowFromInput = parseAllowFromInput;
const setup_1 = require("openclaw/plugin-sdk/setup");
// ---------------------------------------------------------------------------
// Config mutation helpers
// ---------------------------------------------------------------------------
function setFeishuDmPolicy(cfg, dmPolicy) {
    const allowFrom = dmPolicy === 'open'
        ? (0, setup_1.addWildcardAllowFrom)(cfg.channels?.feishu?.allowFrom)?.map((entry) => String(entry))
        : undefined;
    return {
        ...cfg,
        channels: {
            ...cfg.channels,
            feishu: {
                ...cfg.channels?.feishu,
                dmPolicy,
                ...(allowFrom ? { allowFrom } : {}),
            },
        },
    };
}
function setFeishuAllowFrom(cfg, allowFrom) {
    return {
        ...cfg,
        channels: {
            ...cfg.channels,
            feishu: {
                ...cfg.channels?.feishu,
                allowFrom,
            },
        },
    };
}
function setFeishuGroupPolicy(cfg, groupPolicy) {
    return {
        ...cfg,
        channels: {
            ...cfg.channels,
            feishu: {
                ...cfg.channels?.feishu,
                enabled: true,
                groupPolicy,
            },
        },
    };
}
function setFeishuGroupAllowFrom(cfg, groupAllowFrom) {
    return {
        ...cfg,
        channels: {
            ...cfg.channels,
            feishu: {
                ...cfg.channels?.feishu,
                groupAllowFrom,
            },
        },
    };
}
function setFeishuGroups(cfg, groups) {
    return {
        ...cfg,
        channels: {
            ...cfg.channels,
            feishu: {
                ...cfg.channels?.feishu,
                groups,
            },
        },
    };
}
// ---------------------------------------------------------------------------
// Input helpers
// ---------------------------------------------------------------------------
function parseAllowFromInput(raw) {
    return raw
        .split(/[\n,;]+/g)
        .map((entry) => entry.trim())
        .filter(Boolean);
}
