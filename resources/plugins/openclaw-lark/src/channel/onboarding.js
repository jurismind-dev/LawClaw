"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Onboarding wizard adapter for the Lark/Feishu channel plugin.
 *
 * Implements the ChannelOnboardingAdapter interface so the `openclaw
 * setup` wizard can configure Feishu credentials, domain, group
 * policies, and DM allowlists interactively.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.feishuOnboardingAdapter = void 0;
const account_id_1 = require("openclaw/plugin-sdk/account-id");
const setup_1 = require("openclaw/plugin-sdk/setup");
const accounts_1 = require("../core/accounts.js");
const probe_1 = require("./probe.js");
const onboarding_config_1 = require("./onboarding-config.js");
const onboarding_migrate_1 = require("./onboarding-migrate.js");
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const channel = 'feishu';
// ---------------------------------------------------------------------------
// Prompter helpers
// ---------------------------------------------------------------------------
async function noteFeishuCredentialHelp(prompter) {
    await prompter.note([
        '1) Go to Feishu Open Platform (open.feishu.cn)',
        '2) Create a self-built app',
        '3) Get App ID and App Secret from Credentials page',
        '4) Enable required permissions: im:message, im:chat, contact:user.base:readonly',
        '5) Publish the app or add it to a test group',
        'Tip: you can also set FEISHU_APP_ID / FEISHU_APP_SECRET env vars.',
        `Docs: ${(0, setup_1.formatDocsLink)('/channels/feishu', 'feishu')}`,
    ].join('\n'), 'Feishu credentials');
}
async function promptFeishuAllowFrom(params) {
    const existing = params.cfg.channels?.feishu?.allowFrom ?? [];
    await params.prompter.note([
        'Allowlist Feishu DMs by open_id or user_id.',
        'You can find user open_id in Feishu admin console or via API.',
        'Examples:',
        '- ou_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        '- on_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    ].join('\n'), 'Feishu allowlist');
    while (true) {
        const entry = await params.prompter.text({
            message: 'Feishu allowFrom (user open_ids)',
            placeholder: 'ou_xxxxx, ou_yyyyy',
            initialValue: existing[0] ? String(existing[0]) : undefined,
            validate: (value) => (String(value ?? '').trim() ? undefined : 'Required'),
        });
        const parts = (0, onboarding_config_1.parseAllowFromInput)(String(entry));
        if (parts.length === 0) {
            await params.prompter.note('Enter at least one user.', 'Feishu allowlist');
            continue;
        }
        const unique = [...new Set([...existing.map((v) => String(v).trim()).filter(Boolean), ...parts])];
        return (0, onboarding_config_1.setFeishuAllowFrom)(params.cfg, unique);
    }
}
// ---------------------------------------------------------------------------
// Credential acquisition
// ---------------------------------------------------------------------------
async function acquireCredentials(params) {
    const { prompter, feishuCfg } = params;
    let next = params.cfg;
    const hasConfigCreds = Boolean(feishuCfg?.appId?.trim() && feishuCfg?.appSecret?.trim());
    const canUseEnv = Boolean(!hasConfigCreds && process.env.FEISHU_APP_ID?.trim() && process.env.FEISHU_APP_SECRET?.trim());
    let appId = null;
    let appSecret = null;
    if (canUseEnv) {
        const keepEnv = await prompter.confirm({
            message: 'FEISHU_APP_ID + FEISHU_APP_SECRET detected. Use env vars?',
            initialValue: true,
        });
        if (keepEnv) {
            next = {
                ...next,
                channels: {
                    ...next.channels,
                    feishu: { ...next.channels?.feishu, enabled: true },
                },
            };
        }
        else {
            appId = String(await prompter.text({
                message: 'Enter Feishu App ID',
                validate: (value) => (value?.trim() ? undefined : 'Required'),
            })).trim();
            appSecret = String(await prompter.text({
                message: 'Enter Feishu App Secret',
                validate: (value) => (value?.trim() ? undefined : 'Required'),
            })).trim();
        }
    }
    else if (hasConfigCreds) {
        const keep = await prompter.confirm({
            message: 'Feishu credentials already configured. Keep them?',
            initialValue: true,
        });
        if (!keep) {
            appId = String(await prompter.text({
                message: 'Enter Feishu App ID',
                validate: (value) => (value?.trim() ? undefined : 'Required'),
            })).trim();
            appSecret = String(await prompter.text({
                message: 'Enter Feishu App Secret',
                validate: (value) => (value?.trim() ? undefined : 'Required'),
            })).trim();
        }
    }
    else {
        appId = String(await prompter.text({
            message: 'Enter Feishu App ID',
            validate: (value) => (value?.trim() ? undefined : 'Required'),
        })).trim();
        appSecret = String(await prompter.text({
            message: 'Enter Feishu App Secret',
            validate: (value) => (value?.trim() ? undefined : 'Required'),
        })).trim();
    }
    return { cfg: next, appId, appSecret };
}
// ---------------------------------------------------------------------------
// DM policy
// ---------------------------------------------------------------------------
const dmPolicy = {
    label: 'Feishu',
    channel,
    policyKey: 'channels.feishu.dmPolicy',
    allowFromKey: 'channels.feishu.allowFrom',
    getCurrent: (cfg) => cfg.channels?.feishu?.dmPolicy ?? 'pairing',
    setPolicy: (cfg, policy) => (0, onboarding_config_1.setFeishuDmPolicy)(cfg, policy),
    promptAllowFrom: promptFeishuAllowFrom,
};
// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------
exports.feishuOnboardingAdapter = {
    channel,
    // -----------------------------------------------------------------------
    // getStatus
    // -----------------------------------------------------------------------
    getStatus: async ({ cfg }) => {
        const feishuCfg = cfg.channels?.feishu;
        const configured = Boolean((0, accounts_1.getLarkCredentials)(feishuCfg));
        // Attempt a live probe when credentials are present.
        let probeResult = null;
        if (configured && feishuCfg) {
            try {
                probeResult = await (0, probe_1.probeFeishu)(feishuCfg);
            }
            catch {
                // Ignore probe errors -- status degrades gracefully.
            }
        }
        const statusLines = [];
        if (!configured) {
            statusLines.push('Feishu: needs app credentials');
        }
        else if (probeResult?.ok) {
            statusLines.push(`Feishu: connected as ${probeResult.botName ?? probeResult.botOpenId ?? 'bot'}`);
        }
        else {
            statusLines.push('Feishu: configured (connection not verified)');
        }
        return {
            channel,
            configured,
            statusLines,
            selectionHint: configured ? 'configured' : 'needs app creds',
            quickstartScore: configured ? 2 : 0,
        };
    },
    // -----------------------------------------------------------------------
    // configure
    // -----------------------------------------------------------------------
    configure: async ({ cfg, prompter }) => {
        const feishuCfg = cfg.channels?.feishu;
        const resolved = (0, accounts_1.getLarkCredentials)(feishuCfg);
        let next = cfg;
        // Show credential help if nothing is configured yet.
        if (!resolved) {
            await noteFeishuCredentialHelp(prompter);
        }
        // --- Credential acquisition ---
        const creds = await acquireCredentials({ cfg: next, prompter, feishuCfg });
        next = creds.cfg;
        // --- Persist and test credentials ---
        if (creds.appId && creds.appSecret) {
            next = {
                ...next,
                channels: {
                    ...next.channels,
                    feishu: {
                        ...next.channels?.feishu,
                        enabled: true,
                        appId: creds.appId,
                        appSecret: creds.appSecret,
                    },
                },
            };
            const testCfg = next.channels?.feishu;
            try {
                const probe = await (0, probe_1.probeFeishu)(testCfg);
                if (probe.ok) {
                    await prompter.note(`Connected as ${probe.botName ?? probe.botOpenId ?? 'bot'}`, 'Feishu connection test');
                }
                else {
                    await prompter.note(`Connection failed: ${probe.error ?? 'unknown error'}`, 'Feishu connection test');
                }
            }
            catch (err) {
                await prompter.note(`Connection test failed: ${String(err)}`, 'Feishu connection test');
            }
        }
        // --- Domain selection ---
        const currentDomain = next.channels?.feishu?.domain ?? 'feishu';
        const domain = await prompter.select({
            message: 'Which Feishu domain?',
            options: [
                { value: 'feishu', label: 'Feishu (feishu.cn) - China' },
                { value: 'lark', label: 'Lark (larksuite.com) - International' },
            ],
            initialValue: currentDomain,
        });
        if (domain) {
            next = {
                ...next,
                channels: {
                    ...next.channels,
                    feishu: {
                        ...next.channels?.feishu,
                        domain: domain,
                    },
                },
            };
        }
        // --- Legacy migration ---
        next = await (0, onboarding_migrate_1.migrateLegacyGroupAllowFrom)({ cfg: next, prompter });
        // --- Group policy ---
        const groupPolicy = await prompter.select({
            message: 'Group chat policy — which groups can interact with the bot?',
            options: [
                {
                    value: 'allowlist',
                    label: 'Allowlist — only groups listed in `groups` config (default)',
                },
                {
                    value: 'open',
                    label: 'Open — any group (requires @mention)',
                },
                {
                    value: 'disabled',
                    label: 'Disabled — no group interactions',
                },
            ],
            initialValue: next.channels?.feishu?.groupPolicy ?? 'allowlist',
        });
        if (groupPolicy) {
            next = (0, onboarding_config_1.setFeishuGroupPolicy)(next, groupPolicy);
        }
        // --- Group sender allowlist ---
        if (groupPolicy !== 'disabled') {
            const existing = next.channels?.feishu?.groupAllowFrom ?? [];
            const entry = await prompter.text({
                message: 'Group sender allowlist — which users can trigger the bot in allowed groups? (user open_ids)',
                placeholder: 'ou_xxxxx, ou_yyyyy',
                initialValue: existing.length > 0 ? existing.map(String).join(', ') : undefined,
            });
            if (entry) {
                const parts = (0, onboarding_config_1.parseAllowFromInput)(String(entry));
                if (parts.length > 0) {
                    next = (0, onboarding_config_1.setFeishuGroupAllowFrom)(next, parts);
                }
            }
            else if (groupPolicy === 'allowlist') {
                await prompter.note('Empty sender list + allowlist = nobody can trigger. ' +
                    "Use groupPolicy 'open' if you want anyone in allowed groups to trigger.", 'Note');
            }
        }
        return { cfg: next, accountId: account_id_1.DEFAULT_ACCOUNT_ID };
    },
    // -----------------------------------------------------------------------
    // dmPolicy
    // -----------------------------------------------------------------------
    dmPolicy,
    // -----------------------------------------------------------------------
    // disable
    // -----------------------------------------------------------------------
    disable: (cfg) => ({
        ...cfg,
        channels: {
            ...cfg.channels,
            feishu: { ...cfg.channels?.feishu, enabled: false },
        },
    }),
};
