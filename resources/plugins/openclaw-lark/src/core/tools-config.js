"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Default values and resolution logic for the Feishu tools configuration.
 *
 * Each boolean flag controls whether a particular category of Feishu-specific
 * agent tools (document access, wiki queries, drive operations, etc.) is
 * enabled for a given account.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TOOLS_CONFIG = void 0;
exports.resolveToolsConfig = resolveToolsConfig;
exports.resolveAnyEnabledToolsConfig = resolveAnyEnabledToolsConfig;
exports.shouldRegisterTool = shouldRegisterTool;
// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
/**
 * The default tools configuration.
 *
 * By default every non-destructive capability is enabled.  The `perm` flag
 * (permission management) defaults to `false` because granting / revoking
 * permissions is a privileged operation that admins should opt into
 * explicitly.
 */
exports.DEFAULT_TOOLS_CONFIG = {
    doc: true,
    wiki: true,
    drive: true,
    scopes: true,
    perm: false,
    mail: true,
    sheets: true,
    okr: false,
};
// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------
/**
 * Merge a partial tools configuration with `DEFAULT_TOOLS_CONFIG`.
 *
 * Fields present in the input take precedence; anything absent falls back
 * to the default value.
 */
function resolveToolsConfig(cfg) {
    if (!cfg)
        return { ...exports.DEFAULT_TOOLS_CONFIG };
    return {
        doc: cfg.doc ?? exports.DEFAULT_TOOLS_CONFIG.doc,
        wiki: cfg.wiki ?? exports.DEFAULT_TOOLS_CONFIG.wiki,
        drive: cfg.drive ?? exports.DEFAULT_TOOLS_CONFIG.drive,
        perm: cfg.perm ?? exports.DEFAULT_TOOLS_CONFIG.perm,
        scopes: cfg.scopes ?? exports.DEFAULT_TOOLS_CONFIG.scopes,
        mail: cfg.mail ?? exports.DEFAULT_TOOLS_CONFIG.mail,
        sheets: cfg.sheets ?? exports.DEFAULT_TOOLS_CONFIG.sheets,
        okr: cfg.okr ?? exports.DEFAULT_TOOLS_CONFIG.okr,
    };
}
// ---------------------------------------------------------------------------
// Multi-account aggregation
// ---------------------------------------------------------------------------
/**
 * 合并多个账户的工具配置（取并集）。
 *
 * 工具注册是全局的（启动时注册一次），只要任意一个账户启用了某工具，
 * 该工具就应被注册。执行时由 LarkTicket 路由到具体账户。
 */
function resolveAnyEnabledToolsConfig(accounts) {
    const merged = {
        doc: false,
        wiki: false,
        drive: false,
        perm: false,
        scopes: false,
        mail: false,
        sheets: false,
        okr: false,
    };
    for (const account of accounts) {
        const cfg = resolveToolsConfig(account.config.tools);
        merged.doc = merged.doc || cfg.doc;
        merged.wiki = merged.wiki || cfg.wiki;
        merged.drive = merged.drive || cfg.drive;
        merged.perm = merged.perm || cfg.perm;
        merged.scopes = merged.scopes || cfg.scopes;
        merged.mail = merged.mail || cfg.mail;
        merged.sheets = merged.sheets || cfg.sheets;
        merged.okr = merged.okr || cfg.okr;
    }
    return merged;
}
// ---------------------------------------------------------------------------
// Channel-level tool registration control
// ---------------------------------------------------------------------------
/**
 * Check whether a string matches any of the given patterns.
 * Supports trailing `*` as a simple wildcard (e.g., `feishu_calendar_*`).
 */
function matchesAnyPattern(value, patterns) {
    for (const pattern of patterns) {
        if (pattern === '*')
            return true;
        if (pattern.endsWith('*')) {
            if (value.startsWith(pattern.slice(0, -1)))
                return true;
        }
        else if (value === pattern) {
            return true;
        }
    }
    return false;
}
/**
 * 检查工具是否应该被注册（channel 级别的 tools.deny 检查）。
 *
 * 从 `channels.feishu.tools.deny` 读取禁用列表，支持通配符模式。
 *
 * @param cfg - OpenClaw 配置对象
 * @param toolName - 工具名称（如 `feishu_im_user_message`）
 * @returns `true` 如果应该注册，`false` 如果应该跳过
 *
 * @example
 * ```typescript
 * // 配置示例：
 * // channels.feishu.tools.deny: ["feishu_im_user_message", "feishu_calendar_*"]
 *
 * shouldRegisterTool(cfg, "feishu_im_user_message")  // false
 * shouldRegisterTool(cfg, "feishu_calendar_event")   // false (匹配通配符)
 * shouldRegisterTool(cfg, "feishu_task_task")        // true
 * ```
 */
function shouldRegisterTool(cfg, toolName) {
    const feishuConfig = cfg.channels?.feishu;
    const denyList = feishuConfig?.['tools']?.['deny'];
    if (Array.isArray(denyList) && denyList.length > 0) {
        if (matchesAnyPattern(toolName, denyList)) {
            return false;
        }
    }
    return true;
}
