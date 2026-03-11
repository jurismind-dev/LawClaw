/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Register all chat commands (/feishu_diagnose, /feishu_doctor, /feishu_auth, /feishu).
 */
import { runDiagnosis, formatDiagReportText } from './diagnose';
import { runFeishuDoctor } from './doctor';
import { runFeishuAuth } from './auth';
import { getPluginVersion } from '../core/version';
// TODO: 暂时注释掉，等产品策略明确后再放开
// import {
//   checkMultiAccountIsolation,
//   formatIsolationWarning,
//   generateIsolationFixCommands,
//   generateSharedAgentCommands,
//   needsDmScopeFix,
// } from "../core/security-check";
export function registerCommands(api) {
    // /feishu_diagnose
    api.registerCommand({
        name: 'feishu_diagnose',
        description: '运行飞书插件诊断，检查配置、连通性和权限状态',
        acceptsArgs: false,
        requireAuth: true,
        async handler(ctx) {
            try {
                const report = await runDiagnosis({ config: ctx.config });
                return { text: formatDiagReportText(report) };
            }
            catch (err) {
                return {
                    text: `诊断执行失败: ${err instanceof Error ? err.message : String(err)}`,
                };
            }
        },
    });
    // /feishu_doctor
    api.registerCommand({
        name: 'feishu_doctor',
        description: '运行飞书插件诊断',
        acceptsArgs: false,
        requireAuth: true,
        async handler(ctx) {
            try {
                const markdown = await runFeishuDoctor(ctx.config, ctx.accountId);
                return { text: markdown };
            }
            catch (err) {
                return {
                    text: `诊断执行失败: ${err instanceof Error ? err.message : String(err)}`,
                };
            }
        },
    });
    // /feishu_auth
    api.registerCommand({
        name: 'feishu_auth',
        description: '飞书用户权限批量授权',
        acceptsArgs: false,
        requireAuth: true,
        async handler(ctx) {
            try {
                const result = await runFeishuAuth(ctx.config);
                return { text: result };
            }
            catch (err) {
                return {
                    text: `授权执行失败: ${err instanceof Error ? err.message : String(err)}`,
                };
            }
        },
    });
    // /feishu (统一入口，支持子命令)
    api.registerCommand({
        name: 'feishu',
        description: '飞书插件命令（支持子命令: auth, doctor, start）',
        acceptsArgs: true,
        requireAuth: true,
        async handler(ctx) {
            const args = ctx.args?.trim().split(/\s+/) || [];
            const subcommand = args[0]?.toLowerCase();
            try {
                // /feishu auth 或 /feishu onboarding
                if (subcommand === 'auth' || subcommand === 'onboarding') {
                    const result = await runFeishuAuth(ctx.config);
                    return { text: result };
                }
                // /feishu doctor
                if (subcommand === 'doctor') {
                    const markdown = await runFeishuDoctor(ctx.config, ctx.accountId);
                    return { text: markdown };
                }
                // /feishu start
                if (subcommand === 'start') {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const cfg = ctx.config;
                    const errors = [];
                    const warnings = [];
                    // 检查旧版插件是否已禁用 (error)
                    const feishuEntry = cfg.plugins?.entries?.feishu;
                    if (feishuEntry && feishuEntry.enabled !== false) {
                        errors.push('❌ 检测到旧版插件未禁用。\n' +
                            '👉 请依次运行命令：\n' +
                            '```\n' +
                            'openclaw config set plugins.entries.feishu.enabled false --json\n' +
                            'openclaw gateway restart\n' +
                            '```');
                    }
                    // 检查 tools.profile (warning)
                    const profile = cfg.tools?.profile;
                    const incompleteProfiles = new Set(['minimal', 'coding', 'messaging']);
                    if (profile && incompleteProfiles.has(profile)) {
                        warnings.push(`⚠️ 工具 Profile 当前为 \`${profile}\`，飞书工具可能无法加载。请检查配置是否正确。\n`);
                    }
                    // 检查多账号隔离
                    // TODO: 暂时注释掉，等产品策略明确后再放开
                    // const isolationWarning = formatIsolationWarning(
                    //   checkMultiAccountIsolation(cfg),
                    //   cfg,
                    // );
                    // if (isolationWarning) {
                    //   warnings.push(isolationWarning);
                    // }
                    if (errors.length > 0) {
                        const all = [...errors, ...warnings];
                        return {
                            text: `❌ 飞书 OpenClaw 插件启动失败：\n\n${all.join('\n\n')}`,
                        };
                    }
                    if (warnings.length > 0) {
                        return {
                            text: `⚠️ 飞书 OpenClaw 插件已启动 v${getPluginVersion()}（存在警告）\n\n${warnings.join('\n\n')}`,
                        };
                    }
                    return { text: `✅ 飞书 OpenClaw 插件已启动 v${getPluginVersion()}` };
                }
                // /feishu isolate
                // TODO: 暂时注释掉，等产品策略明确后再放开
                // if (subcommand === "isolate") {
                //   return handleIsolate(ctx.config);
                // }
                // /feishu help 或无效子命令或无参数
                return {
                    text: `飞书OpenClaw插件 v${getPluginVersion()}\n\n` +
                        '用法：\n' +
                        '  /feishu start - 校验插件配置\n' +
                        '  /feishu auth - 批量授权用户权限\n' +
                        '  /feishu doctor - 运行诊断\n' +
                        '  /feishu help - 显示此帮助',
                };
            }
            catch (err) {
                return {
                    text: `执行失败: ${err instanceof Error ? err.message : String(err)}`,
                };
            }
        },
    });
}
// ---------------------------------------------------------------------------
// /feishu isolate handler
// TODO: 暂时注释掉，等产品策略明确后再放开
// ---------------------------------------------------------------------------
// function handleIsolate(config: any): { text: string } {
//   const status = checkMultiAccountIsolation(config);
//   const hasDmIssue = needsDmScopeFix(config);
//
//   if (status.mode === "not-applicable") {
//     return { text: "✅ 当前只有一个飞书机器人，无需配置。" };
//   }
//   if (status.mode === "isolated") {
//     const names = status.accounts.map((a) => a.name ?? a.accountId).join("、");
//     const lines = [`✅ **记忆已隔离** — ${status.accounts.length} 个机器人（${names}）各自拥有独立记忆，互不干扰。`];
//     if (hasDmIssue) { lines.push("", "---", "", ...formatDmIssueSection()); }
//     return { text: lines.join("\n") };
//   }
//   if (status.mode === "shared-explicit") {
//     const names = status.accounts.map((a) => a.name ?? a.accountId).join("、");
//     const lines = [
//       `✅ **记忆共用（已确认）** — ${status.accounts.length} 个机器人（${names}）共用同一份记忆（${status.sharedAgentId}）。`,
//       "", "这是您主动配置的。如需改为各自独立，先删除现有 bindings 后重新执行 **/feishu isolate**。",
//     ];
//     if (hasDmIssue) { lines.push("", "---", "", ...formatDmIssueSection()); }
//     return { text: lines.join("\n") };
//   }
//   const fix = generateIsolationFixCommands(config);
//   const shared = generateSharedAgentCommands(config);
//   const names = status.accounts.map((a) => a.name ?? a.accountId);
//   const lines: string[] = [];
//   lines.push("⚠️ **检测到以下问题，建议修复：**", "");
//   lines.push(`**1. 多个机器人共用记忆** — 用户跟「${names[0]}」说的话，可能出现在「${names[1] ?? "..."}」的回复里。`);
//   if (hasDmIssue) { lines.push(`**2. 私聊消息串混** — 同一用户跟不同机器人的私聊会混在一段对话中，AI 无法分辨。`); }
//   if (fix) { lines.push("", "---", "", "✅ **方案一：各自独立**（推荐）", "", "每个机器人拥有独立的记忆，互不干扰：", "", fix.preview, "", "复制到终端执行：", "", "```"); for (const cmd of fix.commands) lines.push(cmd); lines.push("```"); }
//   if (shared) { lines.push("", "---", "", "☑️ **方案二：确认共用**", "", "所有机器人共享同一份记忆（消除告警，不再提示）：", "", shared.preview, "", "复制到终端执行：", "", "```"); for (const cmd of shared.commands) lines.push(cmd); lines.push("```"); }
//   lines.push("", "---", "", "执行后重新发送 **/feishu isolate** 验证。");
//   return { text: lines.join("\n") };
// }
//
// function formatDmIssueSection(): string[] {
//   return [
//     "⚠️ **私聊消息串混**", "",
//     "同一用户跟不同机器人的私聊会混在同一段对话中，AI 无法分辨在跟哪个机器人说话。", "",
//     "复制到终端执行：", "",
//     "```", `openclaw config set session.dmScope "per-account-channel-peer"`, "openclaw gateway restart", "```",
//   ];
// }
//# sourceMappingURL=index.js.map