"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_oauth tool — User OAuth authorisation management.
 *
 * Actions:
 *   - authorize : Initiate Device Flow, send auth card, poll for token.
 *   - status    : Check whether the current user has a valid UAT.
 *   - revoke    : Remove the current user's stored UAT.
 *
 * Security:
 *   - **Does not** accept a `user_open_id` parameter.  The target user is
 *     always the message sender, obtained from the LarkTicket.
 *   - Token values are never included in the return payload (AI cannot see
 *     them).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuOAuthTool = registerFeishuOAuthTool;
exports.executeAuthorize = executeAuthorize;
const typebox_1 = require("@sinclair/typebox");
const accounts_1 = require("../core/accounts.js");
const owner_policy_1 = require("../core/owner-policy.js");
const lark_client_1 = require("../core/lark-client.js");
const app_scope_checker_1 = require("../core/app-scope-checker.js");
const lark_ticket_1 = require("../core/lark-ticket.js");
const lark_logger_1 = require("../core/lark-logger.js");
const log = (0, lark_logger_1.larkLogger)('tools/oauth');
const api_error_1 = require("../core/api-error.js");
const device_flow_1 = require("../core/device-flow.js");
const token_store_1 = require("../core/token-store.js");
const uat_client_1 = require("../core/uat-client.js");
const cardkit_1 = require("../card/cardkit.js");
const synthetic_message_1 = require("../messaging/inbound/synthetic-message.js");
const oauth_cards_1 = require("./oauth-cards.js");
const helpers_1 = require("./helpers.js");
const json = helpers_1.formatToolResult;
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const FeishuOAuthSchema = typebox_1.Type.Object({
    action: typebox_1.Type.Union([
        // Type.Literal("authorize"),  // 已由 auto-auth 自动处理，不再对外暴露
        typebox_1.Type.Literal('revoke'),
    ], {
        description: 'revoke: 撤销当前用户已保存的授权凭据',
    }),
}, {
    description: '飞书用户撤销授权工具。' +
        '仅在用户明确说"撤销授权"、"取消授权"、"退出登录"、"清除授权"时调用。' +
        '【严禁调用场景】用户说"重新授权"、"发起授权"、"重新发起"、"授权失败"、"授权过期"时，绝对不要调用此工具，授权流程由系统自动处理。',
});
const pendingFlows = new Map();
// ---------------------------------------------------------------------------
// Identity verification after Device Flow
// ---------------------------------------------------------------------------
/**
 * 使用刚获取的 UAT 调用 /authen/v1/user_info，
 * 验证实际完成 OAuth 授权的用户 open_id 是否与预期的 senderOpenId 一致。
 *
 * 防止群聊中其他用户点击授权链接后，错误的 UAT 被绑定到 owner 的身份。
 */
async function verifyTokenIdentity(brand, accessToken, expectedOpenId) {
    const domain = brand === 'lark' ? 'https://open.larksuite.com' : 'https://open.feishu.cn';
    const url = `${domain}/open-apis/authen/v1/user_info`;
    try {
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = (await res.json());
        if (data.code !== 0) {
            log.warn(`user_info API error: code=${data.code}, msg=${data.msg}`);
            return { valid: false };
        }
        const actualOpenId = data.data?.open_id;
        if (!actualOpenId) {
            log.warn('user_info API returned no open_id');
            return { valid: false };
        }
        return {
            valid: actualOpenId === expectedOpenId,
            actualOpenId,
        };
    }
    catch (err) {
        log.warn(`identity verification request failed: ${err}`);
        return { valid: false };
    }
}
// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
function registerFeishuOAuthTool(api) {
    if (!api.config)
        return;
    const cfg = api.config;
    (0, helpers_1.registerTool)(api, {
        name: 'feishu_oauth',
        label: 'Feishu OAuth',
        description: '飞书用户撤销授权工具。' +
            '仅在用户明确说"撤销授权"、"取消授权"、"退出登录"、"清除授权"时调用 revoke。' +
            '【严禁调用场景】用户说"重新授权"、"发起授权"、"重新发起"、"授权失败"、"授权过期"时，绝对不要调用此工具，授权流程由系统自动处理，无需人工干预。' +
            '不需要传入 user_open_id，系统自动从消息上下文获取当前用户。',
        parameters: FeishuOAuthSchema,
        async execute(_toolCallId, params) {
            const p = params;
            // Resolve identity from trace context (set in monitor.ts).
            const ticket = (0, lark_ticket_1.getTicket)();
            const senderOpenId = ticket?.senderOpenId;
            if (!senderOpenId) {
                return json({
                    error: '无法获取当前用户身份（senderOpenId），请在飞书对话中使用此工具。',
                });
            }
            // Use the accountId from LarkTicket to resolve the correct account
            // (important for multi-account setups like prod + boe).
            const acct = (0, accounts_1.getLarkAccount)(cfg, ticket.accountId);
            if (!acct.configured) {
                return json({
                    error: `账号 ${ticket.accountId} 缺少 appId 或 appSecret 配置`,
                });
            }
            const account = acct; // Now we know it's ConfiguredLarkAccount
            try {
                switch (p.action) {
                    // ---------------------------------------------------------------
                    // AUTHORIZE — 已由 auto-auth 自动处理，此分支不再对外暴露
                    // ---------------------------------------------------------------
                    // case "authorize": {
                    //   return await executeAuthorize({
                    //     account,
                    //     senderOpenId,
                    //     scope: p.scope || "",
                    //     isBatchAuth: false,
                    //     cfg,
                    //     ticket,
                    //   });
                    // }
                    // ---------------------------------------------------------------
                    // STATUS
                    // ---------------------------------------------------------------
                    // case "status": {
                    //   const status = await getUATStatus(account.appId, senderOpenId);
                    //   return json({
                    //     authorized: status.authorized,
                    //     scope: status.scope,
                    //     token_status: status.tokenStatus,
                    //     granted_at: status.grantedAt
                    //       ? new Date(status.grantedAt).toISOString()
                    //       : undefined,
                    //     expires_at: status.expiresAt
                    //       ? new Date(status.expiresAt).toISOString()
                    //       : undefined,
                    //   });
                    // }
                    // ---------------------------------------------------------------
                    // REVOKE
                    // ---------------------------------------------------------------
                    case 'revoke': {
                        await (0, uat_client_1.revokeUAT)(account.appId, senderOpenId);
                        return json({ success: true, message: '用户授权已撤销。' });
                    }
                    default:
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        return json({ error: `未知操作: ${p.action}` });
                }
            }
            catch (err) {
                log.error(`${p.action} failed: ${err}`);
                return json({ error: (0, api_error_1.formatLarkError)(err) });
            }
        },
    }, { name: 'feishu_oauth' });
    api.logger.debug?.('feishu_oauth: Registered feishu_oauth tool');
}
/**
 * 执行 OAuth 授权流程（Device Flow）
 * 可被 feishu_oauth 和 feishu_oauth_batch_auth 共享调用
 */
async function executeAuthorize(params) {
    const { account, senderOpenId, scope, isBatchAuth, totalAppScopes, alreadyGranted, batchInfo, skipSyntheticMessage, showBatchAuthHint, forceAuth, onAuthComplete, cfg, ticket, } = params;
    const { appId, appSecret, brand, accountId } = account;
    // 0. Check if the user is the app owner (fail-close: 安全优先).
    const sdk = lark_client_1.LarkClient.fromAccount(account).sdk;
    try {
        await (0, owner_policy_1.assertOwnerAccessStrict)(account, sdk, senderOpenId);
    }
    catch (err) {
        if (err instanceof owner_policy_1.OwnerAccessDeniedError) {
            log.warn(`non-owner user ${senderOpenId} attempted to authorize`);
            return json({
                error: 'permission_denied',
                message: '当前应用仅限所有者（App Owner）使用。您没有权限发起授权，无法使用相关功能。',
            });
        }
        throw err;
    }
    // effectiveScope：可变 scope 变量，后续可能因 pendingFlow 合并而扩大
    let effectiveScope = scope;
    // 1. Check if user already authorised + scope coverage.
    // forceAuth=true 时跳过缓存检查，直接发起新 Device Flow。
    // 用于 AppScopeMissing 场景：应用权限刚被移除再补回，本地 UAT 缓存的 scope 状态不可信。
    const existing = forceAuth ? null : await (0, token_store_1.getStoredToken)(appId, senderOpenId);
    if (existing && (0, token_store_1.tokenStatus)(existing) !== 'expired') {
        // 如果请求了特定 scope，检查是否已覆盖
        if (effectiveScope) {
            const requestedScopes = effectiveScope.split(/\s+/).filter(Boolean);
            const grantedScopes = new Set((existing.scope ?? '').split(/\s+/).filter(Boolean));
            const missingScopes = requestedScopes.filter((s) => !grantedScopes.has(s));
            if (missingScopes.length > 0) {
                // scope 不足 → 继续走 Device Flow（飞书 OAuth 是增量授权）
                log.info(`existing token missing scopes [${missingScopes.join(', ')}], starting incremental auth`);
                // 不 revoke 旧 token，直接用缺失的 scope 发起新 Device Flow
                // 飞书会累积授权，新 token 包含旧 + 新 scope
                // 继续执行下面的 Device Flow 逻辑
            }
            else {
                if (onAuthComplete) {
                    try {
                        await onAuthComplete();
                    }
                    catch (e) {
                        log.warn(`onAuthComplete failed: ${e}`);
                    }
                }
                return json({
                    success: true,
                    message: '用户已授权，scope 已覆盖。',
                    authorized: true,
                    scope: existing.scope,
                });
            }
        }
        else {
            if (onAuthComplete) {
                try {
                    await onAuthComplete();
                }
                catch (e) {
                    log.warn(`onAuthComplete failed: ${e}`);
                }
            }
            return json({
                success: true,
                message: '用户已授权，无需重复授权。',
                authorized: true,
                scope: existing.scope,
            });
        }
    }
    // 2. Guard against duplicate in-flight flows for this user.
    const flowKey = `${appId}:${senderOpenId}`;
    let reuseCardId;
    let reuseSeq = 0;
    if (pendingFlows.has(flowKey)) {
        const oldFlow = pendingFlows.get(flowKey);
        const currentMessageId = ticket?.messageId ?? '';
        if (oldFlow.messageId === currentMessageId) {
            // 同一轮工具调用（messageId 相同）→ 复用旧卡片
            oldFlow.superseded = true;
            oldFlow.controller.abort();
            reuseCardId = oldFlow.cardId;
            reuseSeq = oldFlow.sequence;
            pendingFlows.delete(flowKey);
            // scope 合并：将旧 flow 的 scope 与新请求合并
            if (oldFlow.scope) {
                const oldScopes = oldFlow.scope.split(/\s+/).filter(Boolean);
                const newScopes = effectiveScope?.split(/\s+/).filter(Boolean) ?? [];
                const merged = new Set([...oldScopes, ...newScopes]);
                effectiveScope = [...merged].join(' ');
                log.info(`scope merge on reuse: [${[...merged].join(', ')}]`);
            }
            log.info(`same message, replacing flow for user=${senderOpenId}, app=${appId}, reusing cardId=${reuseCardId}`);
        }
        else {
            // 新对话（messageId 不同）→ 取消旧流 + 旧卡片标记"授权未完成" + 创建新卡片
            oldFlow.superseded = true;
            oldFlow.controller.abort();
            pendingFlows.delete(flowKey);
            log.info(`new message, cancelling old flow for user=${senderOpenId}, app=${appId}, old cardId=${oldFlow.cardId}`);
            // 标记旧卡片为"授权未完成"
            try {
                await (0, cardkit_1.updateCardKitCardForAuth)({
                    cfg,
                    cardId: oldFlow.cardId,
                    card: (0, oauth_cards_1.buildAuthFailedCard)('新的授权请求已发起'),
                    sequence: oldFlow.sequence + 1,
                    accountId,
                });
            }
            catch (e) {
                log.warn(`failed to update old card to expired: ${e}`);
            }
            // reuseCardId 保持 undefined，后续会创建新卡片
        }
    }
    // 2.5 应用 scope 预检：过滤掉应用未开通的 scope
    let filteredScope = effectiveScope;
    let unavailableScopes = [];
    if (effectiveScope) {
        try {
            const sdk = lark_client_1.LarkClient.fromAccount(account).sdk;
            const requestedScopes = effectiveScope.split(/\s+/).filter(Boolean);
            const appScopes = await (0, app_scope_checker_1.getAppGrantedScopes)(sdk, appId, 'user');
            const availableScopes = requestedScopes.filter((s) => appScopes.includes(s));
            unavailableScopes = requestedScopes.filter((s) => !appScopes.includes(s));
            if (unavailableScopes.length > 0) {
                log.info(`app has not granted scopes [${unavailableScopes.join(', ')}], filtering them out`);
                if (availableScopes.length === 0) {
                    // 所有 scope 都未开通，直接返回错误
                    const openDomain = brand === 'lark' ? 'https://open.larksuite.com' : 'https://open.feishu.cn';
                    const permissionUrl = `${openDomain}/app/${appId}/permission`;
                    return json({
                        error: 'app_scopes_not_granted',
                        message: `应用未开通任何请求的用户权限，无法发起授权。请先在开放平台开通以下权限：\n${unavailableScopes.map((s) => `- ${s}`).join('\n')}\n\n权限管理地址：${permissionUrl}`,
                        unavailable_scopes: unavailableScopes,
                        app_permission_url: permissionUrl,
                    });
                }
                // 部分 scope 未开通，只授权已开通的 scope
                filteredScope = availableScopes.join(' ');
                log.info(`proceeding with available scopes [${availableScopes.join(', ')}]`);
            }
        }
        catch (err) {
            // 如果 scope 检查失败，记录日志但继续执行（降级处理）
            log.warn(`failed to check app scopes, proceeding anyway: ${err}`);
        }
    }
    // 3. Request device authorisation.
    const deviceAuth = await (0, device_flow_1.requestDeviceAuthorization)({
        appId,
        appSecret,
        brand,
        scope: filteredScope,
    });
    // 4. Build and send authorisation card.
    const authCard = (0, oauth_cards_1.buildAuthCard)({
        verificationUriComplete: deviceAuth.verificationUriComplete,
        expiresMin: Math.round(deviceAuth.expiresIn / 60),
        scope: filteredScope, // 使用过滤后的 scope
        isBatchAuth,
        totalAppScopes,
        alreadyGranted,
        batchInfo,
        filteredScopes: unavailableScopes.length > 0 ? unavailableScopes : undefined,
        appId,
        showBatchAuthHint,
        brand,
    });
    let cardId;
    let seq;
    const chatId = ticket?.chatId;
    if (!chatId || !ticket) {
        return json({ error: '无法确定发送目标' });
    }
    if (reuseCardId) {
        // 复用旧卡片：原地更新内容（scope + 授权链接），不创建新卡片
        const newSeq = reuseSeq + 1;
        try {
            await (0, cardkit_1.updateCardKitCardForAuth)({
                cfg,
                cardId: reuseCardId,
                card: authCard,
                sequence: newSeq,
                accountId,
            });
            log.info(`updated existing card ${reuseCardId} with merged scopes, seq=${newSeq}`);
        }
        catch (err) {
            log.warn(`failed to update existing card, creating new one: ${err}`);
            // 降级：创建新卡片
            const newCardId = await (0, cardkit_1.createCardEntity)({ cfg, card: authCard, accountId });
            if (!newCardId)
                return json({ error: '创建授权卡片失败' });
            if (chatId) {
                await (0, cardkit_1.sendCardByCardId)({
                    cfg,
                    to: chatId,
                    cardId: newCardId,
                    replyToMessageId: ticket?.messageId?.startsWith('om_') ? ticket.messageId : undefined,
                    replyInThread: Boolean(ticket?.threadId),
                    accountId,
                });
            }
            cardId = newCardId;
            seq = 1;
            reuseCardId = undefined;
        }
        if (reuseCardId) {
            cardId = reuseCardId;
            seq = newSeq;
        }
        else {
            cardId = cardId;
            seq = seq;
        }
    }
    else {
        // 首次创建卡片
        const newCardId = await (0, cardkit_1.createCardEntity)({ cfg, card: authCard, accountId });
        if (!newCardId) {
            return json({ error: '创建授权卡片失败' });
        }
        await (0, cardkit_1.sendCardByCardId)({
            cfg,
            to: chatId,
            cardId: newCardId,
            replyToMessageId: ticket?.messageId?.startsWith('om_') ? ticket.messageId : undefined,
            replyInThread: Boolean(ticket?.threadId),
            accountId,
        });
        cardId = newCardId;
        seq = 1;
    }
    // 7. Start background polling.
    const abortController = new AbortController();
    const currentFlow = {
        controller: abortController,
        cardId,
        sequence: seq,
        messageId: ticket?.messageId ?? '',
        superseded: false,
        scope: effectiveScope,
    };
    pendingFlows.set(flowKey, currentFlow);
    let pendingFlowDelete = false;
    // Fire-and-forget – polling happens asynchronously.
    (0, device_flow_1.pollDeviceToken)({
        appId,
        appSecret,
        brand,
        deviceCode: deviceAuth.deviceCode,
        interval: deviceAuth.interval,
        expiresIn: deviceAuth.expiresIn,
        signal: abortController.signal,
    })
        .then(async (result) => {
        // 被新流替换后，跳过所有卡片更新，避免覆盖新流的卡片内容
        if (currentFlow.superseded) {
            log.info(`flow superseded, skipping card update for cardId=${cardId}`);
            return;
        }
        if (result.ok) {
            // ===== 身份校验：验证实际授权用户与发起人一致 =====
            const identity = await verifyTokenIdentity(brand, result.token.accessToken, senderOpenId);
            if (!identity.valid) {
                log.warn(`identity mismatch! expected=${senderOpenId}, ` +
                    `actual=${identity.actualOpenId ?? 'unknown'}, cardId=${cardId}`);
                try {
                    await (0, cardkit_1.updateCardKitCardForAuth)({
                        cfg,
                        cardId,
                        card: (0, oauth_cards_1.buildAuthIdentityMismatchCard)(brand),
                        sequence: ++seq,
                        accountId,
                    });
                }
                catch (e) {
                    log.warn(`failed to update card for identity mismatch: ${e}`);
                }
                pendingFlows.delete(flowKey);
                pendingFlowDelete = true;
                return;
            }
            // ===== 身份校验通过，继续保存 token =====
            // Save token to Keychain.
            const now = Date.now();
            const storedToken = {
                userOpenId: senderOpenId,
                appId,
                accessToken: result.token.accessToken,
                refreshToken: result.token.refreshToken,
                expiresAt: now + result.token.expiresIn * 1000,
                refreshExpiresAt: now + result.token.refreshExpiresIn * 1000,
                scope: result.token.scope,
                grantedAt: now,
            };
            await (0, token_store_1.setStoredToken)(storedToken);
            // 1. Update card → success immediately so user sees
            //    visual confirmation right away.
            try {
                await (0, cardkit_1.updateCardKitCardForAuth)({
                    cfg,
                    cardId,
                    card: (0, oauth_cards_1.buildAuthSuccessCard)(brand),
                    sequence: ++seq,
                    accountId,
                });
            }
            catch (e) {
                log.warn(`failed to update card to success: ${e}`);
            }
            // 删除 pending flow
            pendingFlows.delete(flowKey);
            pendingFlowDelete = true;
            // 2. Send synthetic message to notify AI that auth is
            //    complete, so it can automatically retry the operation.
            //    Skip when called from onboarding (no AI context to retry).
            // 调用 onAuthComplete 回调（用于 onboarding 批量授权链式触发）
            if (onAuthComplete) {
                try {
                    await onAuthComplete();
                }
                catch (e) {
                    log.warn(`onAuthComplete failed: ${e}`);
                }
            }
            if (skipSyntheticMessage) {
                log.info('skipSyntheticMessage=true, skipping synthetic message');
            }
            else
                try {
                    const syntheticMsgId = `${ticket.messageId}:auth-complete`;
                    // Provide a minimal runtime so reply-dispatcher
                    // does not crash on `params.runtime.log?.()`.
                    const syntheticRuntime = {
                        log: (msg) => log.info(msg),
                        error: (msg) => log.error(msg),
                    };
                    const status = await (0, synthetic_message_1.dispatchSyntheticTextMessage)({
                        cfg,
                        accountId,
                        chatId,
                        senderOpenId,
                        text: '我已完成飞书账号授权，请继续执行之前的操作。',
                        syntheticMessageId: syntheticMsgId,
                        replyToMessageId: ticket.messageId,
                        chatType: ticket.chatType,
                        threadId: ticket.threadId,
                        runtime: syntheticRuntime,
                    });
                    log.info(`synthetic message queued (${status})`);
                    log.info('synthetic message dispatched after successful auth');
                }
                catch (e) {
                    log.warn(`failed to send synthetic message after auth: ${e}`);
                }
        }
        else {
            // Update card → failure.
            try {
                await (0, cardkit_1.updateCardKitCardForAuth)({
                    cfg,
                    cardId,
                    card: (0, oauth_cards_1.buildAuthFailedCard)(result.message),
                    sequence: ++seq,
                    accountId,
                });
            }
            catch (e) {
                log.warn(`failed to update card to failure: ${e}`);
            }
            // 删除 pending flow
            pendingFlows.delete(flowKey);
            pendingFlowDelete = true;
        }
    })
        .catch((err) => {
        log.error(`polling error: ${err}`);
    })
        .finally(() => {
        if (!pendingFlowDelete) {
            // 只在当前 flow 仍是注册的那个时才删除，避免旧流误删新流的 entry
            if (pendingFlows.get(flowKey) === currentFlow) {
                pendingFlows.delete(flowKey);
            }
        }
    });
    const scopeCount = filteredScope.split(/\s+/).filter(Boolean).length;
    let message = isBatchAuth
        ? `已发送批量授权请求卡片，共需授权 ${scopeCount} 个权限。请在卡片中完成授权。`
        : '已发送授权请求卡片，请用户在卡片中点击链接完成授权。授权完成后请重新执行之前的操作。';
    if (batchInfo) {
        message += batchInfo;
    }
    // 如果有被过滤的 scope，添加提示信息
    if (unavailableScopes.length > 0) {
        const openDomain = brand === 'lark' ? 'https://open.larksuite.com' : 'https://open.feishu.cn';
        const permissionUrl = `${openDomain}/app/${appId}/permission`;
        message += `\n\n⚠️ **注意**：以下权限因应用未开通而被跳过，如需使用请先在开放平台开通：\n${unavailableScopes.map((s) => `- ${s}`).join('\n')}\n\n权限管理地址：${permissionUrl}`;
    }
    const openDomainForResult = brand === 'lark' ? 'https://open.larksuite.com' : 'https://open.feishu.cn';
    return json({
        success: true,
        message,
        awaiting_authorization: true,
        filtered_scopes: unavailableScopes.length > 0 ? unavailableScopes : undefined,
        app_permission_url: unavailableScopes.length > 0 ? `${openDomainForResult}/app/${appId}/permission` : undefined,
    });
}
