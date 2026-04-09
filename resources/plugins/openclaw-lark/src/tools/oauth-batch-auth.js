"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_oauth_batch_auth tool — 批量授权应用已开通的所有用户权限。
 *
 * 自动识别应用已开通但用户未授权的 scope，一次性发起授权请求。
 * 复用 oauth.ts 的 executeAuthorize() 函数。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuOAuthBatchAuthTool = registerFeishuOAuthBatchAuthTool;
const typebox_1 = require("@sinclair/typebox");
const app_scope_checker_1 = require("../core/app-scope-checker.js");
const tool_client_1 = require("../core/tool-client.js");
const token_store_1 = require("../core/token-store.js");
const accounts_1 = require("../core/accounts.js");
const lark_ticket_1 = require("../core/lark-ticket.js");
const lark_client_1 = require("../core/lark-client.js");
const api_error_1 = require("../core/api-error.js");
const tool_scopes_1 = require("../core/tool-scopes.js");
const domains_1 = require("../core/domains.js");
const lark_logger_1 = require("../core/lark-logger.js");
const helpers_1 = require("./oapi/helpers.js");
const oauth_1 = require("./oauth.js");
const log = (0, lark_logger_1.larkLogger)('tools/oauth-batch-auth');
const FeishuOAuthBatchAuthSchema = typebox_1.Type.Object({}, {
    description: '飞书批量授权工具。一次性授权应用已开通的所有用户权限（User Access Token scope）。' +
        "【使用场景】用户明确要求'授权所有权限'、'一次性授权完成'时使用。" +
        '【重要】禁止主动推荐此工具，仅在用户明确要求时使用。',
});
function registerFeishuOAuthBatchAuthTool(api) {
    if (!api.config)
        return;
    const cfg = api.config;
    (0, helpers_1.registerTool)(api, {
        name: 'feishu_oauth_batch_auth',
        label: 'Feishu: OAuth Batch Authorization',
        description: '飞书批量授权工具，一次性授权应用已开通的所有用户权限。' +
            "仅在用户明确要求'授权所有权限'、'一次性授权'时使用。",
        parameters: FeishuOAuthBatchAuthSchema,
        async execute(_toolCallId, _params) {
            try {
                const ticket = (0, lark_ticket_1.getTicket)();
                const senderOpenId = ticket?.senderOpenId;
                if (!senderOpenId) {
                    return (0, helpers_1.json)({
                        error: '无法获取当前用户身份（senderOpenId），请在飞书对话中使用此工具。',
                    });
                }
                const acct = (0, accounts_1.getLarkAccount)(cfg, ticket.accountId);
                if (!acct.configured) {
                    return (0, helpers_1.json)({
                        error: `账号 ${ticket.accountId} 缺少 appId 或 appSecret 配置`,
                    });
                }
                const account = acct; // Now we know it's ConfiguredLarkAccount
                const { appId } = account;
                // 1. 查询应用已开通的 user scope
                const sdk = lark_client_1.LarkClient.fromAccount(account).sdk;
                let appScopes;
                try {
                    appScopes = await (0, app_scope_checker_1.getAppGrantedScopes)(sdk, appId, 'user');
                }
                catch (err) {
                    if (err instanceof tool_client_1.AppScopeCheckFailedError) {
                        return (0, helpers_1.json)({
                            error: 'app_scope_check_failed',
                            message: `应用缺少核心权限 application:application:self_manage，无法查询可授权 scope 列表。\n\n` +
                                `请管理员在飞书开放平台开通此权限后重试。`,
                            permission_link: `${(0, domains_1.openPlatformDomain)(account.brand)}/app/${appId}/auth?q=application:application:self_manage`,
                            app_id: appId,
                        });
                    }
                    throw err;
                }
                // 2. 边界情况：应用无 user scope
                if (appScopes.length === 0) {
                    return (0, helpers_1.json)({
                        success: false,
                        message: '当前应用未开通任何用户级权限（User Access Token scope），' +
                            '无法使用用户身份调用 API。\n\n' +
                            '如需使用用户级功能，请联系管理员在开放平台开通相关权限。',
                        total_app_scopes: 0,
                        app_id: appId,
                    });
                }
                // 3. 过滤掉敏感 scope
                appScopes = (0, tool_scopes_1.filterSensitiveScopes)(appScopes);
                // 4. 查询用户已授权的 scope
                const existing = await (0, token_store_1.getStoredToken)(appId, senderOpenId);
                const grantedScopes = new Set(existing?.scope?.split(/\s+/).filter(Boolean) ?? []);
                // 5. 计算差集（应用已开通但用户未授权）
                const missingScopes = appScopes.filter((s) => !grantedScopes.has(s));
                // 6. 边界情况：用户已授权所有 scope
                if (missingScopes.length === 0) {
                    return (0, helpers_1.json)({
                        success: true,
                        message: `您已授权所有可用权限（共 ${appScopes.length} 个），无需重复授权。`,
                        total_app_scopes: appScopes.length,
                        already_granted: appScopes.length,
                        missing: 0,
                    });
                }
                // 7. 飞书限制：单次最多请求 100 个 scope
                const MAX_SCOPES_PER_BATCH = 100;
                let scopesToAuthorize = missingScopes;
                let batchInfo = '';
                if (missingScopes.length > MAX_SCOPES_PER_BATCH) {
                    // 分批授权：取前 50 个
                    scopesToAuthorize = missingScopes.slice(0, MAX_SCOPES_PER_BATCH);
                    const remainingCount = missingScopes.length - MAX_SCOPES_PER_BATCH;
                    batchInfo =
                        `\n\n由于飞书限制（单次最多 ${MAX_SCOPES_PER_BATCH} 个 scope），` +
                            `本次将授权前 ${MAX_SCOPES_PER_BATCH} 个权限。\n` +
                            `授权完成后，还需授权剩余 ${remainingCount} 个权限`;
                }
                // 8. 调用共享的 executeAuthorize() 函数（复用 oauth.ts 逻辑）
                const alreadyGrantedScopes = appScopes.filter((s) => grantedScopes.has(s));
                log.info(`scope check: total=${appScopes.length}, granted=${alreadyGrantedScopes.length}, missing=${missingScopes.length}`);
                const scope = scopesToAuthorize.join(' ');
                const result = await (0, oauth_1.executeAuthorize)({
                    account,
                    senderOpenId,
                    scope,
                    isBatchAuth: true,
                    totalAppScopes: appScopes.length,
                    alreadyGranted: alreadyGrantedScopes.length,
                    batchInfo,
                    cfg,
                    ticket,
                });
                // 9. 如果是分批授权，在返回结果中添加提示
                if (batchInfo && result.details) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const details = result.details;
                    if (details.message) {
                        details.message = details.message + batchInfo;
                    }
                }
                return result;
            }
            catch (err) {
                api.logger.error?.(`feishu_oauth_batch_auth: ${err}`);
                return (0, helpers_1.json)({ error: (0, api_error_1.formatLarkError)(err) });
            }
        },
    }, { name: 'feishu_oauth_batch_auth' });
    api.logger.debug?.('feishu_oauth_batch_auth: Registered feishu_oauth_batch_auth tool');
}
