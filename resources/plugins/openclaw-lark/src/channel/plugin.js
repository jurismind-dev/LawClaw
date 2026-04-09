"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * ChannelPlugin interface implementation for the Lark/Feishu channel.
 *
 * This is the top-level entry point that the OpenClaw plugin system uses to
 * discover capabilities, resolve accounts, obtain outbound adapters, and
 * start the inbound event gateway.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.feishuPlugin = void 0;
const account_id_1 = require("openclaw/plugin-sdk/account-id");
const channel_status_1 = require("openclaw/plugin-sdk/channel-status");
const accounts_1 = require("../core/accounts.js");
const outbound_1 = require("../messaging/outbound/outbound.js");
const actions_1 = require("../messaging/outbound/actions.js");
const policy_1 = require("../messaging/inbound/policy.js");
const lark_client_1 = require("../core/lark-client.js");
const send_1 = require("../messaging/outbound/send.js");
const targets_1 = require("../core/targets.js");
const onboarding_auth_1 = require("../tools/onboarding-auth.js");
const lark_logger_1 = require("../core/lark-logger.js");
const config_schema_1 = require("../core/config-schema.js");
const config_adapter_1 = require("./config-adapter.js");
const directory_1 = require("./directory.js");
const pluginLog = (0, lark_logger_1.larkLogger)('channel/plugin');
/** 状态轮询的探针结果缓存时长（5 分钟）。 */
const PROBE_CACHE_TTL_MS = 5 * 60 * 1000;
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Convert nullable SDK params to optional params for directory functions. */
function adaptDirectoryParams(params) {
    return {
        cfg: params.cfg,
        query: params.query ?? undefined,
        limit: params.limit ?? undefined,
        accountId: params.accountId ?? undefined,
    };
}
// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------
const meta = {
    id: 'feishu',
    label: 'Feishu',
    selectionLabel: 'Lark/Feishu (\u98DE\u4E66)',
    docsPath: '/channels/feishu',
    docsLabel: 'feishu',
    blurb: '\u98DE\u4E66/Lark enterprise messaging.',
    aliases: ['lark'],
    order: 70,
};
// ---------------------------------------------------------------------------
// Channel plugin definition
// ---------------------------------------------------------------------------
exports.feishuPlugin = {
    id: 'feishu',
    meta: {
        ...meta,
    },
    // -------------------------------------------------------------------------
    // Pairing
    // -------------------------------------------------------------------------
    pairing: {
        idLabel: 'feishuUserId',
        normalizeAllowEntry: (entry) => entry.replace(/^(feishu|user|open_id):/i, ''),
        notifyApproval: async ({ cfg, id }) => {
            const accountId = (0, accounts_1.getDefaultLarkAccountId)(cfg);
            pluginLog.info('notifyApproval called', { id, accountId });
            // 1. 发送配对成功消息（保持现有行为）
            await (0, send_1.sendMessageFeishu)({
                cfg,
                to: id,
                text: channel_status_1.PAIRING_APPROVED_MESSAGE,
                accountId,
            });
            // 2. 触发 onboarding
            try {
                await (0, onboarding_auth_1.triggerOnboarding)({ cfg, userOpenId: id, accountId });
                pluginLog.info('onboarding completed', { id });
            }
            catch (err) {
                pluginLog.warn('onboarding failed', { id, error: String(err) });
            }
        },
    },
    // -------------------------------------------------------------------------
    // Capabilities
    // -------------------------------------------------------------------------
    capabilities: {
        chatTypes: ['direct', 'group'],
        media: true,
        reactions: true,
        threads: true,
        polls: false,
        nativeCommands: true,
        blockStreaming: true,
    },
    // -------------------------------------------------------------------------
    // Agent prompt
    // -------------------------------------------------------------------------
    agentPrompt: {
        messageToolHints: () => [
            '- Feishu targeting: omit `target` to reply to the current conversation (auto-inferred). Explicit targets: `user:open_id` or `chat:chat_id`.',
            '- Feishu supports interactive cards for rich messages.',
            '- Feishu reactions use UPPERCASE emoji type names (e.g. `OK`,`THUMBSUP`,`THANKS`,`MUSCLE`,`FINGERHEART`,`APPLAUSE`,`FISTBUMP`,`JIAYI`,`DONE`,`SMILE`,`BLUSH` ), not Unicode emoji characters.',
            "- Feishu `action=delete`/`action=unsend` only deletes messages sent by the bot. When the user quotes a message and says 'delete this', use the **quoted message's** message_id, not the user's own message_id.",
        ],
    },
    // -------------------------------------------------------------------------
    // Groups
    // -------------------------------------------------------------------------
    groups: {
        resolveToolPolicy: policy_1.resolveFeishuGroupToolPolicy,
    },
    // -------------------------------------------------------------------------
    // Reload
    // -------------------------------------------------------------------------
    reload: { configPrefixes: ['channels.feishu'] },
    // -------------------------------------------------------------------------
    // Config schema (JSON Schema)
    // -------------------------------------------------------------------------
    configSchema: {
        schema: config_schema_1.FEISHU_CONFIG_JSON_SCHEMA,
    },
    // -------------------------------------------------------------------------
    // Config adapter
    // -------------------------------------------------------------------------
    config: {
        listAccountIds: (cfg) => (0, accounts_1.getLarkAccountIds)(cfg),
        resolveAccount: (cfg, accountId) => (0, accounts_1.getLarkAccount)(cfg, accountId),
        defaultAccountId: (cfg) => (0, accounts_1.getDefaultLarkAccountId)(cfg),
        setAccountEnabled: ({ cfg, accountId, enabled }) => {
            return (0, config_adapter_1.setAccountEnabled)(cfg, accountId, enabled);
        },
        deleteAccount: ({ cfg, accountId }) => {
            return (0, config_adapter_1.deleteAccount)(cfg, accountId);
        },
        isConfigured: (account) => account.configured,
        describeAccount: (account) => ({
            accountId: account.accountId,
            enabled: account.enabled,
            configured: account.configured,
            name: account.name,
            appId: account.appId,
            brand: account.brand,
        }),
        resolveAllowFrom: ({ cfg, accountId }) => {
            const account = (0, accounts_1.getLarkAccount)(cfg, accountId);
            return (account.config?.allowFrom ?? []).map((entry) => String(entry));
        },
        formatAllowFrom: ({ allowFrom }) => allowFrom
            .map((entry) => String(entry).trim())
            .filter(Boolean)
            .map((entry) => entry.toLowerCase()),
    },
    // -------------------------------------------------------------------------
    // Security
    // -------------------------------------------------------------------------
    security: {
        collectWarnings: ({ cfg, accountId }) => (0, config_adapter_1.collectFeishuSecurityWarnings)({ cfg, accountId: accountId ?? account_id_1.DEFAULT_ACCOUNT_ID }),
    },
    // -------------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------------
    setup: {
        resolveAccountId: () => account_id_1.DEFAULT_ACCOUNT_ID,
        applyAccountConfig: ({ cfg, accountId }) => {
            return (0, config_adapter_1.applyAccountConfig)(cfg, accountId, { enabled: true });
        },
    },
    // -------------------------------------------------------------------------
    // Messaging
    // -------------------------------------------------------------------------
    messaging: {
        normalizeTarget: (raw) => (0, targets_1.normalizeFeishuTarget)(raw) ?? undefined,
        targetResolver: {
            looksLikeId: targets_1.looksLikeFeishuId,
            hint: '<chatId|user:openId|chat:chatId>',
        },
    },
    // -------------------------------------------------------------------------
    // Directory
    // -------------------------------------------------------------------------
    directory: {
        self: async () => null,
        listPeers: async (p) => (0, directory_1.listFeishuDirectoryPeers)(adaptDirectoryParams(p)),
        listGroups: async (p) => (0, directory_1.listFeishuDirectoryGroups)(adaptDirectoryParams(p)),
        listPeersLive: async (p) => (0, directory_1.listFeishuDirectoryPeersLive)(adaptDirectoryParams(p)),
        listGroupsLive: async (p) => (0, directory_1.listFeishuDirectoryGroupsLive)(adaptDirectoryParams(p)),
    },
    // -------------------------------------------------------------------------
    // Outbound
    // -------------------------------------------------------------------------
    outbound: outbound_1.feishuOutbound,
    // -------------------------------------------------------------------------
    // Threading
    // -------------------------------------------------------------------------
    threading: {
        buildToolContext: ({ context, hasRepliedRef }) => ({
            currentChannelId: (0, targets_1.normalizeFeishuTarget)(context.To ?? '') ?? undefined,
            currentThreadTs: context.MessageThreadId != null ? String(context.MessageThreadId) : undefined,
            currentMessageId: context.CurrentMessageId,
            hasRepliedRef,
        }),
    },
    // -------------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------------
    actions: actions_1.feishuMessageActions,
    // -------------------------------------------------------------------------
    // Status
    // -------------------------------------------------------------------------
    status: {
        defaultRuntime: {
            accountId: account_id_1.DEFAULT_ACCOUNT_ID,
            running: false,
            lastStartAt: null,
            lastStopAt: null,
            lastError: null,
            port: null,
        },
        buildChannelSummary: ({ snapshot }) => ({
            configured: snapshot.configured ?? false,
            running: snapshot.running ?? false,
            lastStartAt: snapshot.lastStartAt ?? null,
            lastStopAt: snapshot.lastStopAt ?? null,
            lastError: snapshot.lastError ?? null,
            port: snapshot.port ?? null,
            probe: snapshot.probe,
            lastProbeAt: snapshot.lastProbeAt ?? null,
        }),
        probeAccount: async ({ account }) => {
            return await lark_client_1.LarkClient.fromAccount(account).probe({ maxAgeMs: PROBE_CACHE_TTL_MS });
        },
        buildAccountSnapshot: ({ account, runtime, probe }) => ({
            accountId: account.accountId,
            enabled: account.enabled,
            configured: account.configured,
            name: account.name,
            appId: account.appId,
            brand: account.brand,
            running: runtime?.running ?? false,
            lastStartAt: runtime?.lastStartAt ?? null,
            lastStopAt: runtime?.lastStopAt ?? null,
            lastError: runtime?.lastError ?? null,
            port: runtime?.port ?? null,
            probe,
        }),
    },
    // -------------------------------------------------------------------------
    // Gateway
    // -------------------------------------------------------------------------
    gateway: {
        startAccount: async (ctx) => {
            const { monitorFeishuProvider } = await Promise.resolve().then(() => __importStar(require('./monitor.js')));
            const account = (0, accounts_1.getLarkAccount)(ctx.cfg, ctx.accountId);
            const port = account.config?.webhookPort ?? null;
            ctx.setStatus({ accountId: ctx.accountId, port });
            ctx.log?.info(`starting feishu[${ctx.accountId}] (mode: ${account.config?.connectionMode ?? 'websocket'})`);
            return monitorFeishuProvider({
                config: ctx.cfg,
                runtime: ctx.runtime,
                abortSignal: ctx.abortSignal,
                accountId: ctx.accountId,
            });
        },
        stopAccount: async (ctx) => {
            ctx.log?.info(`stopping feishu[${ctx.accountId}]`);
            await lark_client_1.LarkClient.clearCache(ctx.accountId);
            ctx.log?.info(`stopped feishu[${ctx.accountId}]`);
        },
    },
};
