/**
 * Channel Configuration Utilities
 * Manages channel configuration in OpenClaw config files.
 *
 * All file I/O uses async fs/promises to avoid blocking the main thread.
 */
import { access, mkdir, readFile, writeFile, readdir, stat, rm } from 'fs/promises';
import { constants } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getOpenClawResolvedDir } from './paths';
import { applyFeishuChannelDefaults } from './feishu-channel-defaults';
import {
    WEIXIN_CHANNEL_ID,
    clearWeixinStoredState,
    hasStoredWeixinCredentials,
    loadWeixinAccountData,
    loadWeixinSettings,
    normalizeWeixinAccountId,
} from './weixin-channel-state';
import * as logger from './logger';
import { hasUtf8Bom, parseJsonText, stringifyJsonText } from './text-encoding';

const OPENCLAW_DIR = join(homedir(), '.openclaw');
const CONFIG_FILE = join(OPENCLAW_DIR, 'openclaw.json');
const LAWCLAW_MAIN_AGENT_ID = 'lawclaw-main';
const REMOVED_CHANNEL_PLUGIN_IDS = new Set(['dingtalk', 'qqbot', 'openclaw-qqbot']);

// Channels that are managed as plugins (config goes under plugins.entries, not channels)
const PLUGIN_CHANNELS: string[] = [];
const LEGACY_BUILTIN_CHANNEL_PLUGIN_IDS = new Set(['whatsapp']);
const BUILTIN_CHANNEL_IDS = new Set([
    'discord',
    'telegram',
    'whatsapp',
    'slack',
    'signal',
    'imessage',
    'matrix',
    'line',
    'msteams',
    'googlechat',
    'mattermost',
]);

// ── Helpers ──────────────────────────────────────────────────────

async function fileExists(p: string): Promise<boolean> {
    try { await access(p, constants.F_OK); return true; } catch { return false; }
}

// ── Types ────────────────────────────────────────────────────────

export interface ChannelConfigData {
    enabled?: boolean;
    [key: string]: unknown;
}

export interface PluginsConfig {
    entries?: Record<string, ChannelConfigData>;
    allow?: string[];
    enabled?: boolean;
    [key: string]: unknown;
}

export interface OpenClawConfig {
    channels?: Record<string, ChannelConfigData>;
    plugins?: PluginsConfig;
    bindings?: unknown[];
    [key: string]: unknown;
}

export interface DeleteChannelConfigResult {
    stillConfigured: boolean;
}

interface BindingMatch {
    channel: string;
    accountId?: string;
    [key: string]: unknown;
}

interface BindingRule {
    agentId: string;
    match: BindingMatch;
    [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBindingRule(value: unknown): value is BindingRule {
    return isRecord(value) && typeof value.agentId === 'string' && isRecord(value.match) && typeof value.match.channel === 'string';
}

function normalizeChannelId(channelType: string): string {
    return channelType.trim().toLowerCase();
}

function removePluginRegistration(config: OpenClawConfig, pluginId: string): boolean {
    if (!config.plugins) {
        return false;
    }

    let modified = false;

    if (config.plugins.entries?.[pluginId]) {
        delete config.plugins.entries[pluginId];
        if (Object.keys(config.plugins.entries).length === 0) {
            delete config.plugins.entries;
        }
        modified = true;
    }

    if (Array.isArray(config.plugins.allow)) {
        const nextAllow = config.plugins.allow.filter((entry) => entry !== pluginId);
        if (nextAllow.length !== config.plugins.allow.length) {
            modified = true;
        }
        if (nextAllow.length > 0) {
            config.plugins.allow = nextAllow;
        } else {
            delete config.plugins.allow;
        }
    }

    if (config.plugins.enabled !== undefined && !config.plugins.allow?.length && !config.plugins.entries) {
        delete config.plugins.enabled;
        modified = true;
    }

    if (Object.keys(config.plugins).length === 0) {
        delete config.plugins;
        modified = true;
    }

    return modified;
}

function cleanupLegacyBuiltInChannelPluginRegistration(
    currentConfig: OpenClawConfig,
    channelType: string
): boolean {
    if (!LEGACY_BUILTIN_CHANNEL_PLUGIN_IDS.has(channelType)) {
        return false;
    }

    return removePluginRegistration(currentConfig, channelType);
}

function listConfiguredBuiltinChannels(
    currentConfig: OpenClawConfig,
    additionalChannelIds: string[] = []
): string[] {
    const configured = new Set<string>();
    const channels = currentConfig.channels ?? {};

    for (const [channelId, section] of Object.entries(channels)) {
        if (!BUILTIN_CHANNEL_IDS.has(channelId)) continue;
        if (!section || section.enabled === false) continue;
        if (Object.keys(section).length > 0) {
            configured.add(channelId);
        }
    }

    for (const channelId of additionalChannelIds) {
        if (BUILTIN_CHANNEL_IDS.has(channelId)) {
            configured.add(channelId);
        }
    }

    return Array.from(configured);
}

function syncBuiltinChannelsWithPluginAllowlist(
    currentConfig: OpenClawConfig,
    additionalBuiltinChannelIds: string[] = []
): void {
    const plugins = currentConfig.plugins;
    if (!plugins || !Array.isArray(plugins.allow)) {
        return;
    }

    const configuredBuiltins = new Set(listConfiguredBuiltinChannels(currentConfig, additionalBuiltinChannelIds));
    const externalPluginIds = plugins.allow.filter(
        (pluginId) => !BUILTIN_CHANNEL_IDS.has(pluginId) && !REMOVED_CHANNEL_PLUGIN_IDS.has(pluginId)
    );

    let nextAllow = [...externalPluginIds];
    if (externalPluginIds.length > 0) {
        nextAllow = [
            ...nextAllow,
            ...Array.from(configuredBuiltins).filter((channelId) => !nextAllow.includes(channelId)),
        ];
    }

    if (nextAllow.length > 0) {
        plugins.allow = nextAllow;
    } else {
        delete plugins.allow;
    }
}

/**
 * Ensure the target channel is routed to lawclaw-main with a single wildcard account binding.
 * Existing bindings for this channel are removed first to guarantee deterministic routing.
 */
export function upsertLawClawChannelBinding(config: OpenClawConfig, channelType: string): boolean {
    const normalizedChannel = normalizeChannelId(channelType);
    if (!normalizedChannel) return false;

    const existingBindings = Array.isArray(config.bindings) ? config.bindings : [];
    const nextBindings = existingBindings.filter((binding) => {
        return !(isBindingRule(binding) && normalizeChannelId(binding.match.channel) === normalizedChannel);
    });

    nextBindings.push({
        agentId: LAWCLAW_MAIN_AGENT_ID,
        match: {
            channel: normalizedChannel,
            accountId: '*',
        },
    });

    const changed = JSON.stringify(existingBindings) !== JSON.stringify(nextBindings);
    if (!changed) {
        return false;
    }

    config.bindings = nextBindings;
    return true;
}

/**
 * Remove LawClaw-managed binding for a channel without touching unrelated routing rules.
 */
export function removeLawClawChannelBinding(config: OpenClawConfig, channelType: string): boolean {
    const normalizedChannel = normalizeChannelId(channelType);
    if (!normalizedChannel || !Array.isArray(config.bindings)) {
        return false;
    }

    const existingBindings = config.bindings;
    const nextBindings = existingBindings.filter((binding) => {
        return !(
            isBindingRule(binding) &&
            binding.agentId === LAWCLAW_MAIN_AGENT_ID &&
            normalizeChannelId(binding.match.channel) === normalizedChannel
        );
    });

    if (nextBindings.length === existingBindings.length) {
        return false;
    }

    if (nextBindings.length === 0) {
        delete config.bindings;
    } else {
        config.bindings = nextBindings;
    }
    return true;
}

export async function enforceLawClawChannelBinding(channelType: string): Promise<boolean> {
    const config = await readOpenClawConfig();
    const changed = upsertLawClawChannelBinding(config, channelType);
    if (changed) {
        await writeOpenClawConfig(config);
    }
    return changed;
}

export async function clearLawClawChannelBinding(channelType: string): Promise<boolean> {
    const config = await readOpenClawConfig();
    const changed = removeLawClawChannelBinding(config, channelType);
    if (changed) {
        await writeOpenClawConfig(config);
    }
    return changed;
}

/**
 * Ensure OpenClaw config directory exists
 */
async function ensureConfigDir(): Promise<void> {
    await mkdir(OPENCLAW_DIR, { recursive: true });
}

export async function readOpenClawConfig(): Promise<OpenClawConfig> {
    await ensureConfigDir();

    if (!(await fileExists(CONFIG_FILE))) {
        return {};
    }

    try {
        const content = await readFile(CONFIG_FILE, 'utf-8');
        const parsed = parseJsonText(content) as OpenClawConfig;
        if (process.platform === 'win32' && !hasUtf8Bom(content)) {
            await writeFile(CONFIG_FILE, stringifyJsonText(parsed), 'utf-8');
        }
        return parsed;
    } catch (error) {
        logger.error('Failed to read OpenClaw config', error);
        console.error('Failed to read OpenClaw config:', error);
        return {};
    }
}

export async function writeOpenClawConfig(config: OpenClawConfig): Promise<void> {
    await ensureConfigDir();

    try {
        await writeFile(CONFIG_FILE, stringifyJsonText(config), 'utf-8');
    } catch (error) {
        logger.error('Failed to write OpenClaw config', error);
        console.error('Failed to write OpenClaw config:', error);
        throw error;
    }
}

// ── Channel operations ───────────────────────────────────────────

export async function saveChannelConfig(
    channelType: string,
    config: ChannelConfigData,
    accountId?: string
): Promise<void> {
    const normalizedChannelType = normalizeChannelId(channelType);
    const resolvedAccountId = accountId ? normalizeWeixinAccountId(accountId) : undefined;
    const currentConfig = await readOpenClawConfig();

    cleanupLegacyBuiltInChannelPluginRegistration(currentConfig, normalizedChannelType);

    // Plugin-based channels (e.g. WhatsApp) go under plugins.entries, not channels
    if (PLUGIN_CHANNELS.includes(normalizedChannelType)) {
        if (!currentConfig.plugins) {
            currentConfig.plugins = {};
        }
        if (!currentConfig.plugins.entries) {
            currentConfig.plugins.entries = {};
        }
        currentConfig.plugins.entries[normalizedChannelType] = {
            ...currentConfig.plugins.entries[normalizedChannelType],
            enabled: config.enabled ?? true,
        };
        await writeOpenClawConfig(currentConfig);
        logger.info('Plugin channel config saved', {
            channelType: normalizedChannelType,
            accountId: resolvedAccountId,
            configFile: CONFIG_FILE,
            path: `plugins.entries.${normalizedChannelType}`,
        });
        console.log(`Saved plugin channel config for ${normalizedChannelType}`);
        return;
    }

    if (!currentConfig.channels) {
        currentConfig.channels = {};
    }

    // Transform config to match OpenClaw expected format
    let transformedConfig: ChannelConfigData = { ...config };

    // Special handling for Discord: convert guildId/channelId to complete structure
    if (normalizedChannelType === 'discord') {
        const { guildId, channelId, ...restConfig } = config;
        transformedConfig = { ...restConfig };

        transformedConfig.groupPolicy = 'allowlist';
        transformedConfig.dm = { enabled: false };
        transformedConfig.retry = {
            attempts: 3,
            minDelayMs: 500,
            maxDelayMs: 30000,
            jitter: 0.1,
        };

        if (guildId && typeof guildId === 'string' && guildId.trim()) {
            const guildConfig: Record<string, unknown> = {
                users: ['*'],
                requireMention: true,
            };

            if (channelId && typeof channelId === 'string' && channelId.trim()) {
                guildConfig.channels = {
                    [channelId.trim()]: { allow: true, requireMention: true }
                };
            } else {
                guildConfig.channels = {
                    '*': { allow: true, requireMention: true }
                };
            }

            transformedConfig.guilds = {
                [guildId.trim()]: guildConfig
            };
        }
    }

    // Special handling for Telegram: convert allowedUsers string to allowlist array
    if (normalizedChannelType === 'telegram') {
        const { allowedUsers, ...restConfig } = config;
        transformedConfig = { ...restConfig };

        if (allowedUsers && typeof allowedUsers === 'string') {
            const users = allowedUsers.split(',')
                .map(u => u.trim())
                .filter(u => u.length > 0);

            if (users.length > 0) {
                transformedConfig.allowFrom = users;
            }
        }
    }

    // Special handling for Feishu: default to open DM policy with wildcard allowlist
    if (normalizedChannelType === 'feishu') {
        const existingConfig = currentConfig.channels[normalizedChannelType] || {};
        transformedConfig.dmPolicy = transformedConfig.dmPolicy ?? existingConfig.dmPolicy ?? 'open';

        let allowFrom = transformedConfig.allowFrom ?? existingConfig.allowFrom ?? ['*'];
        if (!Array.isArray(allowFrom)) {
            allowFrom = [allowFrom];
        }

        if (transformedConfig.dmPolicy === 'open' && !allowFrom.includes('*')) {
            allowFrom = [...allowFrom, '*'];
        }

        transformedConfig.allowFrom = allowFrom;

        transformedConfig = applyFeishuChannelDefaults(transformedConfig, {
            fallbackConfig: existingConfig,
        }).config;
    }

    if (normalizedChannelType === WEIXIN_CHANNEL_ID && resolvedAccountId) {
        const existingSection = currentConfig.channels[normalizedChannelType];
        const existingAccounts =
            existingSection && typeof existingSection.accounts === 'object' && existingSection.accounts !== null && !Array.isArray(existingSection.accounts)
                ? existingSection.accounts as Record<string, ChannelConfigData>
                : {};
        const nextAccountConfig: ChannelConfigData = {
            ...(existingAccounts[resolvedAccountId] || {}),
            ...transformedConfig,
            enabled: transformedConfig.enabled ?? true,
        };

        const nextSection: ChannelConfigData = {
            ...(existingSection || {}),
            enabled: transformedConfig.enabled ?? existingSection?.enabled ?? true,
            defaultAccount:
                typeof existingSection?.defaultAccount === 'string' && existingSection.defaultAccount.trim()
                    ? existingSection.defaultAccount
                    : resolvedAccountId,
            accounts: {
                ...existingAccounts,
                [resolvedAccountId]: nextAccountConfig,
            },
        };

        const mirroredAccountId =
            typeof nextSection.defaultAccount === 'string' && nextSection.defaultAccount.trim()
                ? nextSection.defaultAccount
                : resolvedAccountId;
        const mirroredAccountConfig =
            (nextSection.accounts as Record<string, ChannelConfigData>)[mirroredAccountId]
            || nextAccountConfig;

        for (const [key, value] of Object.entries(mirroredAccountConfig)) {
            nextSection[key] = value;
        }

        const settings = await loadWeixinSettings();
        const accountData = await loadWeixinAccountData(resolvedAccountId);

        if (settings?.baseUrl || accountData?.baseUrl) {
            const resolvedBaseUrl = accountData?.baseUrl || settings?.baseUrl;
            nextSection.baseUrl = resolvedBaseUrl;
            const accounts = nextSection.accounts as Record<string, ChannelConfigData>;
            accounts[resolvedAccountId] = {
                ...accounts[resolvedAccountId],
                baseUrl: resolvedBaseUrl,
            };
        }
        if (settings?.routeTag) {
            nextSection.routeTag = settings.routeTag;
            const accounts = nextSection.accounts as Record<string, ChannelConfigData>;
            accounts[resolvedAccountId] = {
                ...accounts[resolvedAccountId],
                routeTag: settings.routeTag,
            };
        }

        currentConfig.channels[normalizedChannelType] = nextSection;
        syncBuiltinChannelsWithPluginAllowlist(currentConfig, [normalizedChannelType]);

        await writeOpenClawConfig(currentConfig);
        logger.info('Channel config saved', {
            channelType: normalizedChannelType,
            accountId: resolvedAccountId,
            configFile: CONFIG_FILE,
            rawKeys: Object.keys(config),
            transformedKeys: Object.keys(transformedConfig),
            enabled: currentConfig.channels[normalizedChannelType]?.enabled,
        });
        console.log(`Saved channel config for ${normalizedChannelType} account ${resolvedAccountId}`);
        return;
    }

    // Merge with existing config
    currentConfig.channels[normalizedChannelType] = {
        ...currentConfig.channels[normalizedChannelType],
        ...transformedConfig,
        enabled: transformedConfig.enabled ?? true,
    };

    syncBuiltinChannelsWithPluginAllowlist(currentConfig, [normalizedChannelType]);

    await writeOpenClawConfig(currentConfig);
    logger.info('Channel config saved', {
        channelType: normalizedChannelType,
        accountId: resolvedAccountId,
        configFile: CONFIG_FILE,
        rawKeys: Object.keys(config),
        transformedKeys: Object.keys(transformedConfig),
        enabled: currentConfig.channels[normalizedChannelType]?.enabled,
    });
    console.log(`Saved channel config for ${normalizedChannelType}`);
}

export async function getChannelConfig(channelType: string): Promise<ChannelConfigData | undefined> {
    const config = await readOpenClawConfig();
    return config.channels?.[channelType];
}

export async function getChannelFormValues(channelType: string): Promise<Record<string, string> | undefined> {
    const saved = await getChannelConfig(channelType);
    if (!saved) return undefined;

    if (channelType === 'feishu') {
        return undefined;
    }

    const values: Record<string, string> = {};

    if (channelType === 'discord') {
        if (saved.token && typeof saved.token === 'string') {
            values.token = saved.token;
        }
        const guilds = saved.guilds as Record<string, Record<string, unknown>> | undefined;
        if (guilds) {
            const guildIds = Object.keys(guilds);
            if (guildIds.length > 0) {
                values.guildId = guildIds[0];
                const guildConfig = guilds[guildIds[0]];
                const channels = guildConfig?.channels as Record<string, unknown> | undefined;
                if (channels) {
                    const channelIds = Object.keys(channels).filter((id) => id !== '*');
                    if (channelIds.length > 0) {
                        values.channelId = channelIds[0];
                    }
                }
            }
        }
    } else if (channelType === 'telegram') {
        if (Array.isArray(saved.allowFrom)) {
            values.allowedUsers = saved.allowFrom.join(', ');
        }
        for (const [key, value] of Object.entries(saved)) {
            if (typeof value === 'string' && key !== 'enabled') {
                values[key] = value;
            }
        }
    } else {
        for (const [key, value] of Object.entries(saved)) {
            if (typeof value === 'string' && key !== 'enabled') {
                values[key] = value;
            }
        }
    }

    return Object.keys(values).length > 0 ? values : undefined;
}

function cleanupPluginAllowEntry(config: OpenClawConfig, pluginId: string): void {
    if (!config.plugins) {
        return;
    }

    if (config.plugins.entries?.[pluginId]) {
        delete config.plugins.entries[pluginId];
        if (Object.keys(config.plugins.entries).length === 0) {
            delete config.plugins.entries;
        }
    }

    if (Array.isArray(config.plugins.allow)) {
        const nextAllow = config.plugins.allow.filter((item) => item !== pluginId);
        if (nextAllow.length > 0) {
            config.plugins.allow = nextAllow;
        } else {
            delete config.plugins.allow;
        }
    }

    if (Object.keys(config.plugins).length === 0) {
        delete config.plugins;
    }
}

async function deleteWeixinChannelConfig(accountId?: string): Promise<DeleteChannelConfigResult> {
    const currentConfig = await readOpenClawConfig();
    const normalizedAccountId = accountId ? normalizeWeixinAccountId(accountId) : undefined;
    const clearResult = await clearWeixinStoredState(normalizedAccountId);
    const stillConfigured = await hasStoredWeixinCredentials();
    let configChanged = false;

    if (currentConfig.channels?.[WEIXIN_CHANNEL_ID]) {
        delete currentConfig.channels[WEIXIN_CHANNEL_ID];
        configChanged = true;
    }

    if (currentConfig.channels && Object.keys(currentConfig.channels).length === 0) {
        delete currentConfig.channels;
        configChanged = true;
    }

    if (currentConfig.plugins?.entries?.[WEIXIN_CHANNEL_ID] || currentConfig.plugins?.allow?.includes(WEIXIN_CHANNEL_ID)) {
        cleanupPluginAllowEntry(currentConfig, WEIXIN_CHANNEL_ID);
        configChanged = true;
    }

    if (!stillConfigured && removeLawClawChannelBinding(currentConfig, WEIXIN_CHANNEL_ID)) {
        configChanged = true;
    }

    if (configChanged) {
        await writeOpenClawConfig(currentConfig);
    }
    console.log(
        normalizedAccountId
            ? `Deleted Weixin channel state for account ${normalizedAccountId}`
            : 'Deleted all Weixin channel state'
    );

    return {
        stillConfigured: stillConfigured || clearResult.remainingAccountIds.length > 0,
    };
}

export async function deleteChannelConfig(
    channelType: string,
    accountId?: string
): Promise<DeleteChannelConfigResult> {
    if (normalizeChannelId(channelType) === WEIXIN_CHANNEL_ID) {
        return deleteWeixinChannelConfig(accountId);
    }

    const currentConfig = await readOpenClawConfig();
    cleanupLegacyBuiltInChannelPluginRegistration(currentConfig, channelType);

    if (currentConfig.channels?.[channelType]) {
        delete currentConfig.channels[channelType];
        syncBuiltinChannelsWithPluginAllowlist(currentConfig);
        await writeOpenClawConfig(currentConfig);
        console.log(`Deleted channel config for ${channelType}`);
    } else if (PLUGIN_CHANNELS.includes(channelType)) {
        if (currentConfig.plugins?.entries?.[channelType]) {
            delete currentConfig.plugins.entries[channelType];
            if (Object.keys(currentConfig.plugins.entries).length === 0) {
                delete currentConfig.plugins.entries;
            }
            if (currentConfig.plugins && Object.keys(currentConfig.plugins).length === 0) {
                delete currentConfig.plugins;
            }
            syncBuiltinChannelsWithPluginAllowlist(currentConfig);
            await writeOpenClawConfig(currentConfig);
            console.log(`Deleted plugin channel config for ${channelType}`);
        }
    }

    // Special handling for WhatsApp credentials
    if (channelType === 'whatsapp') {
        try {
            const whatsappDir = join(homedir(), '.openclaw', 'credentials', 'whatsapp');
            if (await fileExists(whatsappDir)) {
                await rm(whatsappDir, { recursive: true, force: true });
                console.log('Deleted WhatsApp credentials directory');
            }
        } catch (error) {
            console.error('Failed to delete WhatsApp credentials:', error);
        }
    }

    return { stillConfigured: false };
}

export async function listConfiguredChannels(): Promise<string[]> {
    const config = await readOpenClawConfig();
    const channels: string[] = [];

    if (config.channels) {
        channels.push(...Object.keys(config.channels).filter((channelType) => {
            if (channelType === WEIXIN_CHANNEL_ID) {
                return false;
            }
            return config.channels![channelType]?.enabled !== false;
        }));
    }

    // Check for WhatsApp credentials directory
    try {
        const whatsappDir = join(homedir(), '.openclaw', 'credentials', 'whatsapp');
        if (await fileExists(whatsappDir)) {
            const entries = await readdir(whatsappDir);
            const hasSession = await (async () => {
                for (const entry of entries) {
                    try {
                        const s = await stat(join(whatsappDir, entry));
                        if (s.isDirectory()) return true;
                    } catch { /* ignore */ }
                }
                return false;
            })();

            if (hasSession && !channels.includes('whatsapp')) {
                channels.push('whatsapp');
            }
        }
    } catch {
        // Ignore errors checking whatsapp dir
    }

    if (await hasStoredWeixinCredentials()) {
        channels.push(WEIXIN_CHANNEL_ID);
    }

    return Array.from(new Set(channels));
}

export async function setChannelEnabled(channelType: string, enabled: boolean): Promise<void> {
    const currentConfig = await readOpenClawConfig();
    cleanupLegacyBuiltInChannelPluginRegistration(currentConfig, channelType);

    if (PLUGIN_CHANNELS.includes(channelType)) {
        if (!currentConfig.plugins) currentConfig.plugins = {};
        if (!currentConfig.plugins.entries) currentConfig.plugins.entries = {};
        if (!currentConfig.plugins.entries[channelType]) currentConfig.plugins.entries[channelType] = {};
        currentConfig.plugins.entries[channelType].enabled = enabled;
        await writeOpenClawConfig(currentConfig);
        console.log(`Set plugin channel ${channelType} enabled: ${enabled}`);
        return;
    }

    if (!currentConfig.channels) currentConfig.channels = {};
    if (!currentConfig.channels[channelType]) currentConfig.channels[channelType] = {};
    currentConfig.channels[channelType].enabled = enabled;
    syncBuiltinChannelsWithPluginAllowlist(currentConfig, enabled ? [channelType] : []);
    await writeOpenClawConfig(currentConfig);
    console.log(`Set channel ${channelType} enabled: ${enabled}`);
}

// ── Validation ───────────────────────────────────────────────────

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

const DOCTOR_PARSER_FALLBACK_HINT =
    'Doctor output could not be confidently interpreted; falling back to local channel config checks.';

type DoctorValidationParseResult = {
    errors: string[];
    warnings: string[];
    undetermined: boolean;
};

export function parseDoctorValidationOutput(channelType: string, output: string): DoctorValidationParseResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const normalizedChannelType = channelType.toLowerCase();
    const normalizedOutput = output.trim();

    if (!normalizedOutput) {
        return {
            errors,
            warnings: [DOCTOR_PARSER_FALLBACK_HINT],
            undetermined: true,
        };
    }

    const lines = output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    const channelLines = lines.filter((line) => line.toLowerCase().includes(normalizedChannelType));
    let classifiedCount = 0;

    for (const line of channelLines) {
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('error') || lowerLine.includes('unrecognized key')) {
            errors.push(line);
            classifiedCount += 1;
            continue;
        }
        if (lowerLine.includes('warning')) {
            warnings.push(line);
            classifiedCount += 1;
        }
    }

    if (channelLines.length === 0 || classifiedCount === 0) {
        warnings.push(DOCTOR_PARSER_FALLBACK_HINT);
        return {
            errors,
            warnings,
            undetermined: true,
        };
    }

    return {
        errors,
        warnings,
        undetermined: false,
    };
}

export interface CredentialValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    details?: Record<string, string>;
}

export async function validateChannelCredentials(
    channelType: string,
    config: Record<string, string>
): Promise<CredentialValidationResult> {
    switch (channelType) {
        case 'discord':
            return validateDiscordCredentials(config);
        case 'telegram':
            return validateTelegramCredentials(config);
        default:
            return { valid: true, errors: [], warnings: ['No online validation available for this channel type.'] };
    }
}

async function validateDiscordCredentials(
    config: Record<string, string>
): Promise<CredentialValidationResult> {
    const result: CredentialValidationResult = { valid: true, errors: [], warnings: [], details: {} };
    const token = config.token?.trim();

    if (!token) {
        return { valid: false, errors: ['Bot token is required'], warnings: [] };
    }

    try {
        const meResponse = await fetch('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bot ${token}` },
        });
        if (!meResponse.ok) {
            if (meResponse.status === 401) {
                return { valid: false, errors: ['Invalid bot token. Please check and try again.'], warnings: [] };
            }
            const errorData = await meResponse.json().catch(() => ({}));
            const msg = (errorData as { message?: string }).message || `Discord API error: ${meResponse.status}`;
            return { valid: false, errors: [msg], warnings: [] };
        }
        const meData = (await meResponse.json()) as { username?: string; id?: string; bot?: boolean };
        if (!meData.bot) {
            return { valid: false, errors: ['The provided token belongs to a user account, not a bot. Please use a bot token.'], warnings: [] };
        }
        result.details!.botUsername = meData.username || 'Unknown';
        result.details!.botId = meData.id || '';
    } catch (error) {
        return { valid: false, errors: [`Connection error when validating bot token: ${error instanceof Error ? error.message : String(error)}`], warnings: [] };
    }

    const guildId = config.guildId?.trim();
    if (guildId) {
        try {
            const guildResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
                headers: { Authorization: `Bot ${token}` },
            });
            if (!guildResponse.ok) {
                if (guildResponse.status === 403 || guildResponse.status === 404) {
                    result.errors.push(`Cannot access guild (server) with ID "${guildId}". Make sure the bot has been invited to this server.`);
                    result.valid = false;
                } else {
                    result.errors.push(`Failed to verify guild ID: Discord API returned ${guildResponse.status}`);
                    result.valid = false;
                }
            } else {
                const guildData = (await guildResponse.json()) as { name?: string };
                result.details!.guildName = guildData.name || 'Unknown';
            }
        } catch (error) {
            result.warnings.push(`Could not verify guild ID: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    const channelId = config.channelId?.trim();
    if (channelId) {
        try {
            const channelResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
                headers: { Authorization: `Bot ${token}` },
            });
            if (!channelResponse.ok) {
                if (channelResponse.status === 403 || channelResponse.status === 404) {
                    result.errors.push(`Cannot access channel with ID "${channelId}". Make sure the bot has permission to view this channel.`);
                    result.valid = false;
                } else {
                    result.errors.push(`Failed to verify channel ID: Discord API returned ${channelResponse.status}`);
                    result.valid = false;
                }
            } else {
                const channelData = (await channelResponse.json()) as { name?: string; guild_id?: string };
                result.details!.channelName = channelData.name || 'Unknown';
                if (guildId && channelData.guild_id && channelData.guild_id !== guildId) {
                    result.errors.push(`Channel "${channelData.name}" does not belong to the specified guild. It belongs to a different server.`);
                    result.valid = false;
                }
            }
        } catch (error) {
            result.warnings.push(`Could not verify channel ID: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    return result;
}

async function validateTelegramCredentials(
    config: Record<string, string>
): Promise<CredentialValidationResult> {
    const botToken = config.botToken?.trim();
    const allowedUsers = config.allowedUsers?.trim();

    if (!botToken) return { valid: false, errors: ['Bot token is required'], warnings: [] };
    if (!allowedUsers) return { valid: false, errors: ['At least one allowed user ID is required'], warnings: [] };

    try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
        const data = (await response.json()) as { ok?: boolean; description?: string; result?: { username?: string } };
        if (data.ok) {
            return { valid: true, errors: [], warnings: [], details: { botUsername: data.result?.username || 'Unknown' } };
        }
        return { valid: false, errors: [data.description || 'Invalid bot token'], warnings: [] };
    } catch (error) {
        return { valid: false, errors: [`Connection error: ${error instanceof Error ? error.message : String(error)}`], warnings: [] };
    }
}

export async function validateChannelConfig(channelType: string): Promise<ValidationResult> {
    const { exec } = await import('child_process');
    const resolvedChannelType = normalizeChannelId(channelType);

    const result: ValidationResult = { valid: true, errors: [], warnings: [] };

    try {
        const openclawPath = getOpenClawResolvedDir();

        // Run openclaw doctor command to validate config (async to avoid
        // blocking the main thread).
        const runDoctor = async (command: string): Promise<string> =>
            await new Promise<string>((resolve, reject) => {
                exec(
                    command,
                    {
                        cwd: openclawPath,
                        encoding: 'utf-8',
                        timeout: 30000,
                        windowsHide: true,
                    },
                    (err, stdout, stderr) => {
                        const combined = `${stdout || ''}${stderr || ''}`;
                        if (err) {
                            reject(new Error(combined || err.message));
                            return;
                        }
                        resolve(combined);
                    },
                );
            });

        const output = await runDoctor(`node openclaw.mjs doctor 2>&1`);

        const parsedDoctor = parseDoctorValidationOutput(resolvedChannelType, output);
        result.errors.push(...parsedDoctor.errors);
        result.warnings.push(...parsedDoctor.warnings);
        if (parsedDoctor.errors.length > 0) {
            result.valid = false;
        }
        if (parsedDoctor.undetermined) {
            logger.warn('Doctor output parsing fell back to local channel checks', {
                channelType: resolvedChannelType,
                hint: DOCTOR_PARSER_FALLBACK_HINT,
            });
        }

        const config = await readOpenClawConfig();
        if (!config.channels?.[resolvedChannelType]) {
            result.errors.push(`Channel ${resolvedChannelType} is not configured`);
            result.valid = false;
        } else if (!config.channels[resolvedChannelType].enabled) {
            result.warnings.push(`Channel ${resolvedChannelType} is disabled`);
        }

        if (resolvedChannelType === 'discord') {
            const discordConfig = config.channels?.discord;
            if (!discordConfig?.token) {
                result.errors.push('Discord: Bot token is required');
                result.valid = false;
            }
        } else if (resolvedChannelType === 'telegram') {
            const telegramConfig = config.channels?.telegram;
            if (!telegramConfig?.botToken) {
                result.errors.push('Telegram: Bot token is required');
                result.valid = false;
            }
            const allowedUsers = telegramConfig?.allowFrom as string[] | undefined;
            if (!allowedUsers || allowedUsers.length === 0) {
                result.errors.push('Telegram: Allowed User IDs are required');
                result.valid = false;
            }
        }

        if (result.errors.length === 0 && result.warnings.length === 0) {
            result.valid = true;
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('Unrecognized key') || errorMessage.includes('invalid config')) {
            result.errors.push(errorMessage);
            result.valid = false;
        } else if (errorMessage.includes('ENOENT')) {
            result.errors.push('OpenClaw not found. Please ensure OpenClaw is installed.');
            result.valid = false;
        } else {
            console.warn('Doctor command failed:', errorMessage);
            const config = await readOpenClawConfig();
            if (config.channels?.[resolvedChannelType]) {
                result.valid = true;
            } else {
                result.errors.push(`Channel ${resolvedChannelType} is not configured`);
                result.valid = false;
            }
        }
    }

    return result;
}
