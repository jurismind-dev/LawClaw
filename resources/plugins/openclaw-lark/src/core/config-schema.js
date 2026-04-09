"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Zod-based configuration schema for the OpenClaw Lark/Feishu channel plugin.
 *
 * Provides runtime validation, sensible defaults, and cross-field refinements
 * so that every consuming module can rely on well-typed configuration objects.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FEISHU_CONFIG_JSON_SCHEMA = exports.FeishuConfigSchema = exports.FeishuAccountConfigSchema = exports.FeishuGroupSchema = exports.UATConfigSchema = exports.z = void 0;
const zod_1 = require("zod");
Object.defineProperty(exports, "z", { enumerable: true, get: function () { return zod_1.z; } });
// ---------------------------------------------------------------------------
// Shared micro-schemas
// ---------------------------------------------------------------------------
const DmPolicyEnum = zod_1.z.enum(['open', 'pairing', 'allowlist', 'disabled']);
const GroupPolicyEnum = zod_1.z.enum(['open', 'allowlist', 'disabled']);
const ConnectionModeEnum = zod_1.z.enum(['websocket', 'webhook']);
const ReplyModeValue = zod_1.z.enum(['auto', 'static', 'streaming']);
const ReplyModeSchema = zod_1.z
    .union([
    ReplyModeValue,
    zod_1.z.object({
        default: ReplyModeValue.optional(),
        group: ReplyModeValue.optional(),
        direct: ReplyModeValue.optional(),
    }),
])
    .optional();
const ChunkModeEnum = zod_1.z.enum(['newline', 'paragraph', 'none']);
const DomainSchema = zod_1.z.union([zod_1.z.literal('feishu'), zod_1.z.literal('lark'), zod_1.z.string().regex(/^https:\/\//)]).optional();
const AllowFromSchema = zod_1.z
    .union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())])
    .optional()
    .transform((v) => {
    if (v === undefined || v == null)
        return undefined;
    return Array.isArray(v) ? v : [v];
});
const ToolPolicySchema = zod_1.z
    .object({
    allow: zod_1.z.array(zod_1.z.string()).optional(),
    deny: zod_1.z.array(zod_1.z.string()).optional(),
})
    .optional();
const FeishuToolsFlagSchema = zod_1.z
    .object({
    doc: zod_1.z.boolean().optional(),
    wiki: zod_1.z.boolean().optional(),
    drive: zod_1.z.boolean().optional(),
    perm: zod_1.z.boolean().optional(),
    scopes: zod_1.z.boolean().optional(),
})
    .optional();
const FeishuFooterSchema = zod_1.z
    .object({
    status: zod_1.z.boolean().optional(),
    elapsed: zod_1.z.boolean().optional(),
    tokens: zod_1.z.boolean().optional(),
    cache: zod_1.z.boolean().optional(),
    context: zod_1.z.boolean().optional(),
    model: zod_1.z.boolean().optional(),
})
    .optional();
const BlockStreamingCoalesceSchema = zod_1.z
    .object({
    minChars: zod_1.z.number().optional(),
    maxChars: zod_1.z.number().optional(),
    idleMs: zod_1.z.number().optional(),
})
    .optional();
const MarkdownConfigSchema = zod_1.z
    .object({
    tables: zod_1.z.enum(['off', 'bullets', 'code']).optional(),
})
    .optional();
const HeartbeatSchema = zod_1.z
    .object({
    every: zod_1.z.string().optional(),
    activeHours: zod_1.z
        .object({
        start: zod_1.z.string().optional(),
        end: zod_1.z.string().optional(),
        timezone: zod_1.z.string().optional(),
    })
        .optional(),
    target: zod_1.z.string().optional(),
    to: zod_1.z.string().optional(),
    prompt: zod_1.z.string().optional(),
    accountId: zod_1.z.string().optional(),
})
    .optional();
const CapabilitiesSchema = zod_1.z
    .object({
    image: zod_1.z.boolean().optional(),
    audio: zod_1.z.boolean().optional(),
    video: zod_1.z.boolean().optional(),
})
    .optional();
const DedupSchema = zod_1.z
    .object({
    ttlMs: zod_1.z.number().optional(), // default 43200000 (12h)
    maxEntries: zod_1.z.number().optional(), // default 5000
})
    .optional();
const ReactionNotificationModeSchema = zod_1.z.enum(['off', 'own', 'all']).optional();
exports.UATConfigSchema = zod_1.z
    .object({
    enabled: zod_1.z.boolean().optional(),
    allowedScopes: zod_1.z.array(zod_1.z.string()).optional(),
    blockedScopes: zod_1.z.array(zod_1.z.string()).optional(),
})
    .optional();
const DmConfigSchema = zod_1.z
    .object({
    historyLimit: zod_1.z.number().optional(),
})
    .optional();
// ---------------------------------------------------------------------------
// Group schema
// ---------------------------------------------------------------------------
exports.FeishuGroupSchema = zod_1.z.object({
    groupPolicy: GroupPolicyEnum.optional(),
    requireMention: zod_1.z.boolean().optional(),
    respondToMentionAll: zod_1.z.boolean().optional(),
    tools: ToolPolicySchema,
    skills: zod_1.z.array(zod_1.z.string()).optional(),
    enabled: zod_1.z.boolean().optional(),
    allowFrom: AllowFromSchema,
    systemPrompt: zod_1.z.string().optional(),
});
// ---------------------------------------------------------------------------
// Account config schema (same shape as top-level minus `accounts`)
// ---------------------------------------------------------------------------
exports.FeishuAccountConfigSchema = zod_1.z.object({
    appId: zod_1.z.string().optional(),
    appSecret: zod_1.z.string().optional(),
    encryptKey: zod_1.z.string().optional(),
    verificationToken: zod_1.z.string().optional(),
    name: zod_1.z.string().optional(),
    enabled: zod_1.z.boolean().optional(),
    domain: DomainSchema,
    connectionMode: ConnectionModeEnum.optional(),
    webhookPath: zod_1.z.string().optional(),
    webhookPort: zod_1.z.number().optional(),
    dmPolicy: DmPolicyEnum.optional(),
    allowFrom: AllowFromSchema,
    groupPolicy: GroupPolicyEnum.optional(),
    groupAllowFrom: AllowFromSchema,
    requireMention: zod_1.z.boolean().optional(),
    respondToMentionAll: zod_1.z.boolean().optional(),
    groups: zod_1.z.record(zod_1.z.string(), exports.FeishuGroupSchema).optional(),
    historyLimit: zod_1.z.number().optional(),
    dmHistoryLimit: zod_1.z.number().optional(),
    dms: DmConfigSchema,
    textChunkLimit: zod_1.z.number().optional(),
    chunkMode: ChunkModeEnum.optional(),
    blockStreamingCoalesce: BlockStreamingCoalesceSchema,
    mediaMaxMb: zod_1.z.number().optional(),
    heartbeat: HeartbeatSchema,
    replyMode: ReplyModeSchema,
    streaming: zod_1.z.boolean().optional(),
    blockStreaming: zod_1.z.boolean().optional(),
    toolUseDisplay: zod_1.z
        .object({
        showFullPaths: zod_1.z.boolean().optional(),
    })
        .optional(),
    tools: FeishuToolsFlagSchema,
    footer: FeishuFooterSchema,
    markdown: MarkdownConfigSchema,
    configWrites: zod_1.z.boolean().optional(),
    capabilities: CapabilitiesSchema,
    dedup: DedupSchema,
    reactionNotifications: ReactionNotificationModeSchema,
    threadSession: zod_1.z.boolean().optional(),
    uat: exports.UATConfigSchema,
});
// ---------------------------------------------------------------------------
// Top-level Feishu config schema
// ---------------------------------------------------------------------------
exports.FeishuConfigSchema = exports.FeishuAccountConfigSchema.extend({
    accounts: zod_1.z.record(zod_1.z.string(), exports.FeishuAccountConfigSchema).optional(),
}).superRefine((data, ctx) => {
    // When dmPolicy is "open", allowFrom must contain the wildcard "*".
    if (data.dmPolicy === 'open') {
        const list = data.allowFrom;
        const hasWildcard = Array.isArray(list) && list.includes('*');
        if (!hasWildcard) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ['allowFrom'],
                message: 'When dmPolicy is "open", allowFrom must include "*" to permit all senders.',
            });
        }
    }
});
// ---------------------------------------------------------------------------
// Auto-generated JSON Schema (single source of truth)
// ---------------------------------------------------------------------------
/**
 * JSON Schema derived from FeishuConfigSchema.
 *
 * - `io: "input"` exposes the input type for `.transform()` schemas (e.g. AllowFromSchema).
 * - `unrepresentable: "any"` degrades `.superRefine()` constraints to `{}`.
 * - `target: "draft-07"` matches the plugin system's expected JSON Schema version.
 */
exports.FEISHU_CONFIG_JSON_SCHEMA = (0, zod_1.toJSONSchema)(exports.FeishuConfigSchema, {
    target: 'draft-07',
    io: 'input',
    unrepresentable: 'any',
});
