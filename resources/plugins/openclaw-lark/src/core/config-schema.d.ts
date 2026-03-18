/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Zod-based configuration schema for the OpenClaw Lark/Feishu channel plugin.
 *
 * Provides runtime validation, sensible defaults, and cross-field refinements
 * so that every consuming module can rely on well-typed configuration objects.
 */
import { z } from 'zod';
export { z };
export declare const UATConfigSchema: z.ZodOptional<z.ZodObject<{
    enabled: z.ZodOptional<z.ZodBoolean>;
    allowedScopes: z.ZodOptional<z.ZodArray<z.ZodString>>;
    blockedScopes: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>>;
export declare const FeishuGroupSchema: z.ZodObject<{
    groupPolicy: z.ZodOptional<z.ZodEnum<{
        allowlist: "allowlist";
        open: "open";
        disabled: "disabled";
    }>>;
    requireMention: z.ZodOptional<z.ZodBoolean>;
    tools: z.ZodOptional<z.ZodObject<{
        allow: z.ZodOptional<z.ZodArray<z.ZodString>>;
        deny: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    skills: z.ZodOptional<z.ZodArray<z.ZodString>>;
    enabled: z.ZodOptional<z.ZodBoolean>;
    allowFrom: z.ZodPipe<z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>, z.ZodTransform<string[] | undefined, string | string[] | undefined>>;
    systemPrompt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const FeishuAccountConfigSchema: z.ZodObject<{
    appId: z.ZodOptional<z.ZodString>;
    appSecret: z.ZodOptional<z.ZodString>;
    encryptKey: z.ZodOptional<z.ZodString>;
    verificationToken: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    enabled: z.ZodOptional<z.ZodBoolean>;
    domain: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<"feishu">, z.ZodLiteral<"lark">, z.ZodString]>>;
    connectionMode: z.ZodOptional<z.ZodEnum<{
        websocket: "websocket";
        webhook: "webhook";
    }>>;
    webhookPath: z.ZodOptional<z.ZodString>;
    webhookPort: z.ZodOptional<z.ZodNumber>;
    dmPolicy: z.ZodOptional<z.ZodEnum<{
        allowlist: "allowlist";
        open: "open";
        pairing: "pairing";
        disabled: "disabled";
    }>>;
    allowFrom: z.ZodPipe<z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>, z.ZodTransform<string[] | undefined, string | string[] | undefined>>;
    groupPolicy: z.ZodOptional<z.ZodEnum<{
        allowlist: "allowlist";
        open: "open";
        disabled: "disabled";
    }>>;
    groupAllowFrom: z.ZodPipe<z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>, z.ZodTransform<string[] | undefined, string | string[] | undefined>>;
    requireMention: z.ZodOptional<z.ZodBoolean>;
    groups: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        groupPolicy: z.ZodOptional<z.ZodEnum<{
            allowlist: "allowlist";
            open: "open";
            disabled: "disabled";
        }>>;
        requireMention: z.ZodOptional<z.ZodBoolean>;
        tools: z.ZodOptional<z.ZodObject<{
            allow: z.ZodOptional<z.ZodArray<z.ZodString>>;
            deny: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>;
        skills: z.ZodOptional<z.ZodArray<z.ZodString>>;
        enabled: z.ZodOptional<z.ZodBoolean>;
        allowFrom: z.ZodPipe<z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>, z.ZodTransform<string[] | undefined, string | string[] | undefined>>;
        systemPrompt: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    historyLimit: z.ZodOptional<z.ZodNumber>;
    dmHistoryLimit: z.ZodOptional<z.ZodNumber>;
    dms: z.ZodOptional<z.ZodObject<{
        historyLimit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    textChunkLimit: z.ZodOptional<z.ZodNumber>;
    chunkMode: z.ZodOptional<z.ZodEnum<{
        newline: "newline";
        paragraph: "paragraph";
        none: "none";
    }>>;
    blockStreamingCoalesce: z.ZodOptional<z.ZodObject<{
        minChars: z.ZodOptional<z.ZodNumber>;
        maxChars: z.ZodOptional<z.ZodNumber>;
        idleMs: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    mediaMaxMb: z.ZodOptional<z.ZodNumber>;
    heartbeat: z.ZodOptional<z.ZodObject<{
        every: z.ZodOptional<z.ZodString>;
        activeHours: z.ZodOptional<z.ZodObject<{
            start: z.ZodOptional<z.ZodString>;
            end: z.ZodOptional<z.ZodString>;
            timezone: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        target: z.ZodOptional<z.ZodString>;
        to: z.ZodOptional<z.ZodString>;
        prompt: z.ZodOptional<z.ZodString>;
        accountId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    replyMode: z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
        streaming: "streaming";
        auto: "auto";
        static: "static";
    }>, z.ZodObject<{
        default: z.ZodOptional<z.ZodEnum<{
            streaming: "streaming";
            auto: "auto";
            static: "static";
        }>>;
        group: z.ZodOptional<z.ZodEnum<{
            streaming: "streaming";
            auto: "auto";
            static: "static";
        }>>;
        direct: z.ZodOptional<z.ZodEnum<{
            streaming: "streaming";
            auto: "auto";
            static: "static";
        }>>;
    }, z.core.$strip>]>>;
    streaming: z.ZodOptional<z.ZodBoolean>;
    blockStreaming: z.ZodOptional<z.ZodBoolean>;
    tools: z.ZodOptional<z.ZodObject<{
        doc: z.ZodOptional<z.ZodBoolean>;
        wiki: z.ZodOptional<z.ZodBoolean>;
        drive: z.ZodOptional<z.ZodBoolean>;
        perm: z.ZodOptional<z.ZodBoolean>;
        scopes: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    footer: z.ZodOptional<z.ZodObject<{
        status: z.ZodOptional<z.ZodBoolean>;
        elapsed: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    markdown: z.ZodOptional<z.ZodObject<{
        tables: z.ZodOptional<z.ZodEnum<{
            code: "code";
            off: "off";
            bullets: "bullets";
        }>>;
    }, z.core.$strip>>;
    configWrites: z.ZodOptional<z.ZodBoolean>;
    capabilities: z.ZodOptional<z.ZodObject<{
        image: z.ZodOptional<z.ZodBoolean>;
        audio: z.ZodOptional<z.ZodBoolean>;
        video: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    dedup: z.ZodOptional<z.ZodObject<{
        ttlMs: z.ZodOptional<z.ZodNumber>;
        maxEntries: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    reactionNotifications: z.ZodOptional<z.ZodEnum<{
        all: "all";
        off: "off";
        own: "own";
    }>>;
    threadSession: z.ZodOptional<z.ZodBoolean>;
    uat: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodOptional<z.ZodBoolean>;
        allowedScopes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        blockedScopes: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const FeishuConfigSchema: z.ZodObject<{
    appId: z.ZodOptional<z.ZodString>;
    appSecret: z.ZodOptional<z.ZodString>;
    encryptKey: z.ZodOptional<z.ZodString>;
    verificationToken: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    enabled: z.ZodOptional<z.ZodBoolean>;
    domain: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<"feishu">, z.ZodLiteral<"lark">, z.ZodString]>>;
    connectionMode: z.ZodOptional<z.ZodEnum<{
        websocket: "websocket";
        webhook: "webhook";
    }>>;
    webhookPath: z.ZodOptional<z.ZodString>;
    webhookPort: z.ZodOptional<z.ZodNumber>;
    dmPolicy: z.ZodOptional<z.ZodEnum<{
        allowlist: "allowlist";
        open: "open";
        pairing: "pairing";
        disabled: "disabled";
    }>>;
    allowFrom: z.ZodPipe<z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>, z.ZodTransform<string[] | undefined, string | string[] | undefined>>;
    groupPolicy: z.ZodOptional<z.ZodEnum<{
        allowlist: "allowlist";
        open: "open";
        disabled: "disabled";
    }>>;
    groupAllowFrom: z.ZodPipe<z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>, z.ZodTransform<string[] | undefined, string | string[] | undefined>>;
    requireMention: z.ZodOptional<z.ZodBoolean>;
    groups: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        groupPolicy: z.ZodOptional<z.ZodEnum<{
            allowlist: "allowlist";
            open: "open";
            disabled: "disabled";
        }>>;
        requireMention: z.ZodOptional<z.ZodBoolean>;
        tools: z.ZodOptional<z.ZodObject<{
            allow: z.ZodOptional<z.ZodArray<z.ZodString>>;
            deny: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>;
        skills: z.ZodOptional<z.ZodArray<z.ZodString>>;
        enabled: z.ZodOptional<z.ZodBoolean>;
        allowFrom: z.ZodPipe<z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>, z.ZodTransform<string[] | undefined, string | string[] | undefined>>;
        systemPrompt: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    historyLimit: z.ZodOptional<z.ZodNumber>;
    dmHistoryLimit: z.ZodOptional<z.ZodNumber>;
    dms: z.ZodOptional<z.ZodObject<{
        historyLimit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    textChunkLimit: z.ZodOptional<z.ZodNumber>;
    chunkMode: z.ZodOptional<z.ZodEnum<{
        newline: "newline";
        paragraph: "paragraph";
        none: "none";
    }>>;
    blockStreamingCoalesce: z.ZodOptional<z.ZodObject<{
        minChars: z.ZodOptional<z.ZodNumber>;
        maxChars: z.ZodOptional<z.ZodNumber>;
        idleMs: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    mediaMaxMb: z.ZodOptional<z.ZodNumber>;
    heartbeat: z.ZodOptional<z.ZodObject<{
        every: z.ZodOptional<z.ZodString>;
        activeHours: z.ZodOptional<z.ZodObject<{
            start: z.ZodOptional<z.ZodString>;
            end: z.ZodOptional<z.ZodString>;
            timezone: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        target: z.ZodOptional<z.ZodString>;
        to: z.ZodOptional<z.ZodString>;
        prompt: z.ZodOptional<z.ZodString>;
        accountId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    replyMode: z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
        streaming: "streaming";
        auto: "auto";
        static: "static";
    }>, z.ZodObject<{
        default: z.ZodOptional<z.ZodEnum<{
            streaming: "streaming";
            auto: "auto";
            static: "static";
        }>>;
        group: z.ZodOptional<z.ZodEnum<{
            streaming: "streaming";
            auto: "auto";
            static: "static";
        }>>;
        direct: z.ZodOptional<z.ZodEnum<{
            streaming: "streaming";
            auto: "auto";
            static: "static";
        }>>;
    }, z.core.$strip>]>>;
    streaming: z.ZodOptional<z.ZodBoolean>;
    blockStreaming: z.ZodOptional<z.ZodBoolean>;
    tools: z.ZodOptional<z.ZodObject<{
        doc: z.ZodOptional<z.ZodBoolean>;
        wiki: z.ZodOptional<z.ZodBoolean>;
        drive: z.ZodOptional<z.ZodBoolean>;
        perm: z.ZodOptional<z.ZodBoolean>;
        scopes: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    footer: z.ZodOptional<z.ZodObject<{
        status: z.ZodOptional<z.ZodBoolean>;
        elapsed: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    markdown: z.ZodOptional<z.ZodObject<{
        tables: z.ZodOptional<z.ZodEnum<{
            code: "code";
            off: "off";
            bullets: "bullets";
        }>>;
    }, z.core.$strip>>;
    configWrites: z.ZodOptional<z.ZodBoolean>;
    capabilities: z.ZodOptional<z.ZodObject<{
        image: z.ZodOptional<z.ZodBoolean>;
        audio: z.ZodOptional<z.ZodBoolean>;
        video: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    dedup: z.ZodOptional<z.ZodObject<{
        ttlMs: z.ZodOptional<z.ZodNumber>;
        maxEntries: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    reactionNotifications: z.ZodOptional<z.ZodEnum<{
        all: "all";
        off: "off";
        own: "own";
    }>>;
    threadSession: z.ZodOptional<z.ZodBoolean>;
    uat: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodOptional<z.ZodBoolean>;
        allowedScopes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        blockedScopes: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    accounts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        appId: z.ZodOptional<z.ZodString>;
        appSecret: z.ZodOptional<z.ZodString>;
        encryptKey: z.ZodOptional<z.ZodString>;
        verificationToken: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
        enabled: z.ZodOptional<z.ZodBoolean>;
        domain: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<"feishu">, z.ZodLiteral<"lark">, z.ZodString]>>;
        connectionMode: z.ZodOptional<z.ZodEnum<{
            websocket: "websocket";
            webhook: "webhook";
        }>>;
        webhookPath: z.ZodOptional<z.ZodString>;
        webhookPort: z.ZodOptional<z.ZodNumber>;
        dmPolicy: z.ZodOptional<z.ZodEnum<{
            allowlist: "allowlist";
            open: "open";
            pairing: "pairing";
            disabled: "disabled";
        }>>;
        allowFrom: z.ZodPipe<z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>, z.ZodTransform<string[] | undefined, string | string[] | undefined>>;
        groupPolicy: z.ZodOptional<z.ZodEnum<{
            allowlist: "allowlist";
            open: "open";
            disabled: "disabled";
        }>>;
        groupAllowFrom: z.ZodPipe<z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>, z.ZodTransform<string[] | undefined, string | string[] | undefined>>;
        requireMention: z.ZodOptional<z.ZodBoolean>;
        groups: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            groupPolicy: z.ZodOptional<z.ZodEnum<{
                allowlist: "allowlist";
                open: "open";
                disabled: "disabled";
            }>>;
            requireMention: z.ZodOptional<z.ZodBoolean>;
            tools: z.ZodOptional<z.ZodObject<{
                allow: z.ZodOptional<z.ZodArray<z.ZodString>>;
                deny: z.ZodOptional<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>>;
            skills: z.ZodOptional<z.ZodArray<z.ZodString>>;
            enabled: z.ZodOptional<z.ZodBoolean>;
            allowFrom: z.ZodPipe<z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>, z.ZodTransform<string[] | undefined, string | string[] | undefined>>;
            systemPrompt: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        historyLimit: z.ZodOptional<z.ZodNumber>;
        dmHistoryLimit: z.ZodOptional<z.ZodNumber>;
        dms: z.ZodOptional<z.ZodObject<{
            historyLimit: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        textChunkLimit: z.ZodOptional<z.ZodNumber>;
        chunkMode: z.ZodOptional<z.ZodEnum<{
            newline: "newline";
            paragraph: "paragraph";
            none: "none";
        }>>;
        blockStreamingCoalesce: z.ZodOptional<z.ZodObject<{
            minChars: z.ZodOptional<z.ZodNumber>;
            maxChars: z.ZodOptional<z.ZodNumber>;
            idleMs: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        mediaMaxMb: z.ZodOptional<z.ZodNumber>;
        heartbeat: z.ZodOptional<z.ZodObject<{
            every: z.ZodOptional<z.ZodString>;
            activeHours: z.ZodOptional<z.ZodObject<{
                start: z.ZodOptional<z.ZodString>;
                end: z.ZodOptional<z.ZodString>;
                timezone: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            target: z.ZodOptional<z.ZodString>;
            to: z.ZodOptional<z.ZodString>;
            prompt: z.ZodOptional<z.ZodString>;
            accountId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        replyMode: z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
            streaming: "streaming";
            auto: "auto";
            static: "static";
        }>, z.ZodObject<{
            default: z.ZodOptional<z.ZodEnum<{
                streaming: "streaming";
                auto: "auto";
                static: "static";
            }>>;
            group: z.ZodOptional<z.ZodEnum<{
                streaming: "streaming";
                auto: "auto";
                static: "static";
            }>>;
            direct: z.ZodOptional<z.ZodEnum<{
                streaming: "streaming";
                auto: "auto";
                static: "static";
            }>>;
        }, z.core.$strip>]>>;
        streaming: z.ZodOptional<z.ZodBoolean>;
        blockStreaming: z.ZodOptional<z.ZodBoolean>;
        tools: z.ZodOptional<z.ZodObject<{
            doc: z.ZodOptional<z.ZodBoolean>;
            wiki: z.ZodOptional<z.ZodBoolean>;
            drive: z.ZodOptional<z.ZodBoolean>;
            perm: z.ZodOptional<z.ZodBoolean>;
            scopes: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>>;
        footer: z.ZodOptional<z.ZodObject<{
            status: z.ZodOptional<z.ZodBoolean>;
            elapsed: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>>;
        markdown: z.ZodOptional<z.ZodObject<{
            tables: z.ZodOptional<z.ZodEnum<{
                code: "code";
                off: "off";
                bullets: "bullets";
            }>>;
        }, z.core.$strip>>;
        configWrites: z.ZodOptional<z.ZodBoolean>;
        capabilities: z.ZodOptional<z.ZodObject<{
            image: z.ZodOptional<z.ZodBoolean>;
            audio: z.ZodOptional<z.ZodBoolean>;
            video: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>>;
        dedup: z.ZodOptional<z.ZodObject<{
            ttlMs: z.ZodOptional<z.ZodNumber>;
            maxEntries: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        reactionNotifications: z.ZodOptional<z.ZodEnum<{
            all: "all";
            off: "off";
            own: "own";
        }>>;
        threadSession: z.ZodOptional<z.ZodBoolean>;
        uat: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodOptional<z.ZodBoolean>;
            allowedScopes: z.ZodOptional<z.ZodArray<z.ZodString>>;
            blockedScopes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
/**
 * JSON Schema derived from FeishuConfigSchema.
 *
 * - `io: "input"` exposes the input type for `.transform()` schemas (e.g. AllowFromSchema).
 * - `unrepresentable: "any"` degrades `.superRefine()` constraints to `{}`.
 * - `target: "draft-07"` matches the plugin system's expected JSON Schema version.
 */
export declare const FEISHU_CONFIG_JSON_SCHEMA: Record<string, unknown>;
