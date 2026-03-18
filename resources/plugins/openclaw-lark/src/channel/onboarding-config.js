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
import { addWildcardAllowFrom } from 'openclaw/plugin-sdk';
// ---------------------------------------------------------------------------
// Config mutation helpers
// ---------------------------------------------------------------------------
export function setFeishuDmPolicy(cfg, dmPolicy) {
    const allowFrom = dmPolicy === 'open'
        ? addWildcardAllowFrom(cfg.channels?.feishu?.allowFrom)?.map((entry) => String(entry))
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
export function setFeishuAllowFrom(cfg, allowFrom) {
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
export function setFeishuGroupPolicy(cfg, groupPolicy) {
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
export function setFeishuGroupAllowFrom(cfg, groupAllowFrom) {
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
export function setFeishuGroups(cfg, groups) {
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
export function parseAllowFromInput(raw) {
    return raw
        .split(/[\n,;]+/g)
        .map((entry) => entry.trim())
        .filter(Boolean);
}
