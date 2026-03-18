"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * auth-errors.ts — 统一错误类型定义。
 *
 * 所有与认证/授权/scope 相关的错误类型集中在此文件，
 * 解除 tool-client ↔ app-scope-checker 循环依赖。
 *
 * 其他模块应直接 import 此文件，或通过 tool-client / uat-client 的 re-export 使用。
 */
// ---------------------------------------------------------------------------
// Feishu error code constants
// ---------------------------------------------------------------------------
/** 飞书 OAPI 错误码常量，替代各处硬编码的 magic number。 */
export const LARK_ERROR = {
    /** 应用 scope 不足（租户维度） */
    APP_SCOPE_MISSING: 99991672,
    /** 用户 token scope 不足 */
    USER_SCOPE_INSUFFICIENT: 99991679,
    /** access_token 无效 */
    TOKEN_INVALID: 99991668,
    /** access_token 已过期 */
    TOKEN_EXPIRED: 99991669,
    /** refresh_token 无效 */
    REFRESH_TOKEN_INVALID: 20003,
    /** refresh_token 已过期 */
    REFRESH_TOKEN_EXPIRED: 20004,
    /** refresh_token 缺失 */
    REFRESH_TOKEN_MISSING: 20024,
    /** refresh_token 已被吊销 */
    REFRESH_TOKEN_REVOKED: 20063,
    /** 消息已被撤回 */
    MESSAGE_RECALLED: 230011,
    /** 消息已被删除 */
    MESSAGE_DELETED: 231003,
};
/** 不可恢复的 refresh_token 错误码集合，遇到后需要重新授权。 */
export const REFRESH_TOKEN_IRRECOVERABLE = new Set([
    LARK_ERROR.REFRESH_TOKEN_INVALID,
    LARK_ERROR.REFRESH_TOKEN_EXPIRED,
    LARK_ERROR.REFRESH_TOKEN_MISSING,
    LARK_ERROR.REFRESH_TOKEN_REVOKED,
]);
/** 消息终止错误码集合（撤回/删除），遇到后应停止对该消息的后续操作。 */
export const MESSAGE_TERMINAL_CODES = new Set([
    LARK_ERROR.MESSAGE_RECALLED,
    LARK_ERROR.MESSAGE_DELETED,
]);
/** access_token 失效相关的错误码集合，遇到后可尝试刷新重试。 */
export const TOKEN_RETRY_CODES = new Set([LARK_ERROR.TOKEN_INVALID, LARK_ERROR.TOKEN_EXPIRED]);
// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------
/**
 * Thrown when no valid UAT exists and the user needs to (re-)authorise.
 * Callers should catch this and trigger the OAuth flow.
 */
export class NeedAuthorizationError extends Error {
    userOpenId;
    constructor(userOpenId) {
        super('need_user_authorization');
        this.name = 'NeedAuthorizationError';
        this.userOpenId = userOpenId;
    }
}
/**
 * 应用缺少 application:application:self_manage 权限，无法查询应用权限配置。
 *
 * 需要管理员在飞书开放平台开通 application:application:self_manage 权限。
 */
export class AppScopeCheckFailedError extends Error {
    /** 应用 ID，用于生成开放平台权限管理链接。 */
    appId;
    constructor(appId) {
        super('应用缺少 application:application:self_manage 权限，无法查询应用权限配置。请管理员在开放平台开通该权限。');
        this.name = 'AppScopeCheckFailedError';
        this.appId = appId;
    }
}
/**
 * 应用未开通 OAPI 所需 scope。
 *
 * 需要管理员在飞书开放平台开通权限。
 */
export class AppScopeMissingError extends Error {
    apiName;
    /** OAPI 需要但 APP 未开通的 scope 列表。 */
    missingScopes;
    /** 工具的全部所需 scope（含已开通的），用于应用权限完成后一次性发起用户授权。 */
    allRequiredScopes;
    /** 应用 ID，用于生成开放平台权限管理链接。 */
    appId;
    scopeNeedType;
    /** 触发此错误时使用的 token 类型，用于保持 card action 二次校验一致。 */
    tokenType;
    constructor(info, scopeNeedType, tokenType, allRequiredScopes) {
        if (scopeNeedType === 'one') {
            super(`应用缺少权限 [${info.scopes.join(', ')}](开启任一权限即可)，请管理员在开放平台开通。`);
        }
        else {
            super(`应用缺少权限 [${info.scopes.join(', ')}]，请管理员在开放平台开通。`);
        }
        this.name = 'AppScopeMissingError';
        this.apiName = info.apiName;
        this.missingScopes = info.scopes;
        this.allRequiredScopes = allRequiredScopes;
        this.appId = info.appId;
        this.scopeNeedType = scopeNeedType;
        this.tokenType = tokenType;
    }
}
/**
 * 用户未授权或 scope 不足，需要发起 OAuth 授权。
 *
 * `requiredScopes` 为 APP∩OAPI 的有效 scope，可直接传给
 * `feishu_oauth authorize --scope`。
 */
export class UserAuthRequiredError extends Error {
    userOpenId;
    apiName;
    /** APP∩OAPI 交集 scope，传给 OAuth authorize。 */
    requiredScopes;
    /** 应用 scope 是否已验证通过。false 时 requiredScopes 可能不准确。 */
    appScopeVerified;
    /** 应用 ID，用于生成开放平台权限管理链接。 */
    appId;
    constructor(userOpenId, info) {
        super('need_user_authorization');
        this.name = 'UserAuthRequiredError';
        this.userOpenId = userOpenId;
        this.apiName = info.apiName;
        this.requiredScopes = info.scopes;
        this.appId = info.appId;
        this.appScopeVerified = info.appScopeVerified ?? true;
    }
}
/**
 * 服务端报 99991679 — 用户 token 的 scope 不足。
 *
 * 需要增量授权：用缺失的 scope 发起新 Device Flow。
 */
export class UserScopeInsufficientError extends Error {
    userOpenId;
    apiName;
    /** 缺失的 scope 列表。 */
    missingScopes;
    constructor(userOpenId, info) {
        super('user_scope_insufficient');
        this.name = 'UserScopeInsufficientError';
        this.userOpenId = userOpenId;
        this.apiName = info.apiName;
        this.missingScopes = info.scopes;
    }
}
