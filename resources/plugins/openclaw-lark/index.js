"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * OpenClaw Lark/Feishu plugin entry point.
 *
 * Registers the Feishu channel and all tool families:
 * doc, wiki, drive, perm, bitable, task, calendar.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMessageExpired = exports.checkMessageGate = exports.parseMessageEvent = exports.handleFeishuReaction = exports.feishuPlugin = exports.buildMentionedCardContent = exports.buildMentionedMessage = exports.formatMentionAllForCard = exports.formatMentionAllForText = exports.formatMentionForCard = exports.formatMentionForText = exports.extractMessageBody = exports.nonBotMentions = exports.mentionedBot = exports.feishuMessageActions = exports.listChatMembersFeishu = exports.removeChatMembersFeishu = exports.addChatMembersFeishu = exports.updateChatFeishu = exports.forwardMessageFeishu = exports.VALID_FEISHU_EMOJI_TYPES = exports.FeishuEmoji = exports.listReactionsFeishu = exports.removeReactionFeishu = exports.addReactionFeishu = exports.probeFeishu = exports.sendMediaLark = exports.sendCardLark = exports.sendTextLark = exports.uploadAndSendMediaLark = exports.sendAudioLark = exports.sendFileLark = exports.sendImageLark = exports.uploadFileLark = exports.uploadImageLark = exports.getMessageFeishu = exports.editMessageFeishu = exports.updateCardFeishu = exports.sendCardFeishu = exports.sendMessageFeishu = exports.monitorFeishuProvider = void 0;
const plugin_sdk_1 = require("openclaw/plugin-sdk");
const plugin_1 = require("./src/channel/plugin.js");
const lark_client_1 = require("./src/core/lark-client.js");
const index_1 = require("./src/tools/oapi/index.js");
const index_2 = require("./src/tools/mcp/doc/index.js");
const oauth_1 = require("./src/tools/oauth.js");
const oauth_batch_auth_1 = require("./src/tools/oauth-batch-auth.js");
const ask_user_question_1 = require("./src/tools/ask-user-question.js");
const diagnose_1 = require("./src/commands/diagnose.js");
const index_3 = require("./src/commands/index.js");
const lark_logger_1 = require("./src/core/lark-logger.js");
const security_check_1 = require("./src/core/security-check.js");
const tool_use_trace_store_1 = require("./src/card/tool-use-trace-store.js");
const reasoning_utils_1 = require("./src/card/reasoning-utils.js");
const log = (0, lark_logger_1.larkLogger)('plugin');
// ---------------------------------------------------------------------------
// Re-exports for external consumers
// ---------------------------------------------------------------------------
var monitor_1 = require("./src/channel/monitor.js");
Object.defineProperty(exports, "monitorFeishuProvider", { enumerable: true, get: function () { return monitor_1.monitorFeishuProvider; } });
var send_1 = require("./src/messaging/outbound/send.js");
Object.defineProperty(exports, "sendMessageFeishu", { enumerable: true, get: function () { return send_1.sendMessageFeishu; } });
Object.defineProperty(exports, "sendCardFeishu", { enumerable: true, get: function () { return send_1.sendCardFeishu; } });
Object.defineProperty(exports, "updateCardFeishu", { enumerable: true, get: function () { return send_1.updateCardFeishu; } });
Object.defineProperty(exports, "editMessageFeishu", { enumerable: true, get: function () { return send_1.editMessageFeishu; } });
var fetch_1 = require("./src/messaging/outbound/fetch.js");
Object.defineProperty(exports, "getMessageFeishu", { enumerable: true, get: function () { return fetch_1.getMessageFeishu; } });
var media_1 = require("./src/messaging/outbound/media.js");
Object.defineProperty(exports, "uploadImageLark", { enumerable: true, get: function () { return media_1.uploadImageLark; } });
Object.defineProperty(exports, "uploadFileLark", { enumerable: true, get: function () { return media_1.uploadFileLark; } });
Object.defineProperty(exports, "sendImageLark", { enumerable: true, get: function () { return media_1.sendImageLark; } });
Object.defineProperty(exports, "sendFileLark", { enumerable: true, get: function () { return media_1.sendFileLark; } });
Object.defineProperty(exports, "sendAudioLark", { enumerable: true, get: function () { return media_1.sendAudioLark; } });
Object.defineProperty(exports, "uploadAndSendMediaLark", { enumerable: true, get: function () { return media_1.uploadAndSendMediaLark; } });
var deliver_1 = require("./src/messaging/outbound/deliver.js");
Object.defineProperty(exports, "sendTextLark", { enumerable: true, get: function () { return deliver_1.sendTextLark; } });
Object.defineProperty(exports, "sendCardLark", { enumerable: true, get: function () { return deliver_1.sendCardLark; } });
Object.defineProperty(exports, "sendMediaLark", { enumerable: true, get: function () { return deliver_1.sendMediaLark; } });
var probe_1 = require("./src/channel/probe.js");
Object.defineProperty(exports, "probeFeishu", { enumerable: true, get: function () { return probe_1.probeFeishu; } });
var reactions_1 = require("./src/messaging/outbound/reactions.js");
Object.defineProperty(exports, "addReactionFeishu", { enumerable: true, get: function () { return reactions_1.addReactionFeishu; } });
Object.defineProperty(exports, "removeReactionFeishu", { enumerable: true, get: function () { return reactions_1.removeReactionFeishu; } });
Object.defineProperty(exports, "listReactionsFeishu", { enumerable: true, get: function () { return reactions_1.listReactionsFeishu; } });
Object.defineProperty(exports, "FeishuEmoji", { enumerable: true, get: function () { return reactions_1.FeishuEmoji; } });
Object.defineProperty(exports, "VALID_FEISHU_EMOJI_TYPES", { enumerable: true, get: function () { return reactions_1.VALID_FEISHU_EMOJI_TYPES; } });
var forward_1 = require("./src/messaging/outbound/forward.js");
Object.defineProperty(exports, "forwardMessageFeishu", { enumerable: true, get: function () { return forward_1.forwardMessageFeishu; } });
var chat_manage_1 = require("./src/messaging/outbound/chat-manage.js");
Object.defineProperty(exports, "updateChatFeishu", { enumerable: true, get: function () { return chat_manage_1.updateChatFeishu; } });
Object.defineProperty(exports, "addChatMembersFeishu", { enumerable: true, get: function () { return chat_manage_1.addChatMembersFeishu; } });
Object.defineProperty(exports, "removeChatMembersFeishu", { enumerable: true, get: function () { return chat_manage_1.removeChatMembersFeishu; } });
Object.defineProperty(exports, "listChatMembersFeishu", { enumerable: true, get: function () { return chat_manage_1.listChatMembersFeishu; } });
var actions_1 = require("./src/messaging/outbound/actions.js");
Object.defineProperty(exports, "feishuMessageActions", { enumerable: true, get: function () { return actions_1.feishuMessageActions; } });
var mention_1 = require("./src/messaging/inbound/mention.js");
Object.defineProperty(exports, "mentionedBot", { enumerable: true, get: function () { return mention_1.mentionedBot; } });
Object.defineProperty(exports, "nonBotMentions", { enumerable: true, get: function () { return mention_1.nonBotMentions; } });
Object.defineProperty(exports, "extractMessageBody", { enumerable: true, get: function () { return mention_1.extractMessageBody; } });
Object.defineProperty(exports, "formatMentionForText", { enumerable: true, get: function () { return mention_1.formatMentionForText; } });
Object.defineProperty(exports, "formatMentionForCard", { enumerable: true, get: function () { return mention_1.formatMentionForCard; } });
Object.defineProperty(exports, "formatMentionAllForText", { enumerable: true, get: function () { return mention_1.formatMentionAllForText; } });
Object.defineProperty(exports, "formatMentionAllForCard", { enumerable: true, get: function () { return mention_1.formatMentionAllForCard; } });
Object.defineProperty(exports, "buildMentionedMessage", { enumerable: true, get: function () { return mention_1.buildMentionedMessage; } });
Object.defineProperty(exports, "buildMentionedCardContent", { enumerable: true, get: function () { return mention_1.buildMentionedCardContent; } });
var plugin_2 = require("./src/channel/plugin.js");
Object.defineProperty(exports, "feishuPlugin", { enumerable: true, get: function () { return plugin_2.feishuPlugin; } });
var reaction_handler_1 = require("./src/messaging/inbound/reaction-handler.js");
Object.defineProperty(exports, "handleFeishuReaction", { enumerable: true, get: function () { return reaction_handler_1.handleFeishuReaction; } });
var parse_1 = require("./src/messaging/inbound/parse.js");
Object.defineProperty(exports, "parseMessageEvent", { enumerable: true, get: function () { return parse_1.parseMessageEvent; } });
var gate_1 = require("./src/messaging/inbound/gate.js");
Object.defineProperty(exports, "checkMessageGate", { enumerable: true, get: function () { return gate_1.checkMessageGate; } });
var dedup_1 = require("./src/messaging/inbound/dedup.js");
Object.defineProperty(exports, "isMessageExpired", { enumerable: true, get: function () { return dedup_1.isMessageExpired; } });
// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------
const plugin = {
    id: 'openclaw-lark',
    name: 'Feishu',
    description: 'Lark/Feishu channel plugin with im/doc/wiki/drive/task/calendar tools',
    configSchema: (0, plugin_sdk_1.emptyPluginConfigSchema)(),
    register(api) {
        lark_client_1.LarkClient.setRuntime(api.runtime);
        api.registerChannel({ plugin: plugin_1.feishuPlugin });
        // ========================================
        // Register OAPI tools (calendar, task - using Feishu Open API directly)
        (0, index_1.registerOapiTools)(api);
        // Register MCP doc tools (using Model Context Protocol)
        (0, index_2.registerFeishuMcpDocTools)(api);
        // Register OAuth tool (UAT device flow authorization)
        (0, oauth_1.registerFeishuOAuthTool)(api);
        // Register OAuth batch auth tool (batch authorization for all app scopes)
        (0, oauth_batch_auth_1.registerFeishuOAuthBatchAuthTool)(api);
        // Register AskUserQuestion tool (interactive card-based user prompting)
        (0, ask_user_question_1.registerAskUserQuestionTool)(api);
        api.on('before_tool_call', (event, ctx) => {
            (0, tool_use_trace_store_1.recordToolUseStart)({
                sessionKey: ctx.sessionKey,
                toolName: event.toolName,
                toolParams: event.params,
                toolCallId: event.toolCallId ?? ctx.toolCallId,
                runId: event.runId ?? ctx.runId,
            });
            if (!event.toolName.startsWith('feishu_'))
                return;
            const paramsPreview = (0, reasoning_utils_1.sanitizeParamsForLog)(event.params);
            log.info(`tool call: ${event.toolName} session=${ctx.sessionKey ?? '-'} params=${paramsPreview}`);
        });
        api.on('after_tool_call', (event, ctx) => {
            (0, tool_use_trace_store_1.recordToolUseEnd)({
                sessionKey: ctx.sessionKey,
                toolName: event.toolName,
                toolParams: event.params,
                toolCallId: event.toolCallId ?? ctx.toolCallId,
                runId: event.runId ?? ctx.runId,
                result: event.result,
                error: event.error,
                durationMs: event.durationMs,
            });
            if (!event.toolName.startsWith('feishu_'))
                return;
            if (event.error) {
                log.error(`tool fail: ${event.toolName} session=${ctx.sessionKey ?? '-'} ${event.error} (${event.durationMs ?? 0}ms)`);
            }
            else {
                log.info(`tool done: ${event.toolName} session=${ctx.sessionKey ?? '-'} ok (${event.durationMs ?? 0}ms)`);
            }
        });
        // ---- Diagnostic commands ----
        // CLI: openclaw feishu-diagnose [--trace <messageId>]
        api.registerCli((ctx) => {
            ctx.program
                .command('feishu-diagnose')
                .description('运行飞书插件诊断，检查配置、连通性和权限状态')
                .option('--trace <messageId>', '按 message_id 追踪完整处理链路')
                .option('--analyze', '分析追踪日志（需配合 --trace 使用）')
                .action(async (opts) => {
                try {
                    if (opts.trace) {
                        const lines = await (0, diagnose_1.traceByMessageId)(opts.trace);
                         
                        console.log((0, diagnose_1.formatTraceOutput)(lines, opts.trace));
                        if (opts.analyze && lines.length > 0) {
                             
                            console.log((0, diagnose_1.analyzeTrace)(lines, opts.trace));
                        }
                    }
                    else {
                        const report = await (0, diagnose_1.runDiagnosis)({
                            config: ctx.config,
                            logger: ctx.logger,
                        });
                         
                        console.log((0, diagnose_1.formatDiagReportCli)(report));
                        if (report.overallStatus === 'unhealthy') {
                            process.exitCode = 1;
                        }
                    }
                }
                catch (err) {
                    ctx.logger.error(`诊断命令执行失败: ${err}`);
                    process.exitCode = 1;
                }
            });
        }, { commands: ['feishu-diagnose'] });
        // Chat commands: /feishu_diagnose, /feishu_doctor, /feishu_auth, /feishu
        (0, index_3.registerCommands)(api);
        // ---- Multi-account security checks ----
        if (api.config) {
            (0, security_check_1.emitSecurityWarnings)(api.config, api.logger);
        }
    },
};
exports.default = plugin;
