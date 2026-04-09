"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Structured tool-use display for Lark/Feishu cards.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMPTY_TOOL_USE_PLACEHOLDER = void 0;
exports.normalizeToolUseDisplay = normalizeToolUseDisplay;
exports.buildToolUseTitleSuffix = buildToolUseTitleSuffix;
const reasoning_utils_1 = require("./reasoning-utils.js");
exports.EMPTY_TOOL_USE_PLACEHOLDER = 'No tool steps available';
const DEFAULT_SUMMARY_PREFERENCE = ['matched', 'code', 'quoted', 'url', 'line'];
const TOOL_DESCRIPTORS = [
    {
        aliases: ['skill'],
        iconToken: 'app-default_outlined',
        title: 'Load skill',
        sanitizer: 'skill',
        paramKeys: ['skill', 'name'],
        summaryPatterns: [/^(?:load|use)\s+skill\s+(.+)$/i],
    },
    {
        aliases: ['read', 'open'],
        iconToken: 'file-link-text_outlined',
        title: 'Read',
        sanitizer: 'path',
        paramKeys: ['file_path', 'path', 'file'],
        summaryPatterns: [/^(?:read|open)\s+(?:file\s+)?(.+)$/i],
        summaryPreference: ['code', 'quoted', 'matched', 'line'],
    },
    {
        aliases: ['write', 'edit'],
        iconToken: 'edit_outlined',
        title: 'Edit',
        sanitizer: 'path',
        paramKeys: ['file_path', 'path', 'file'],
        summaryPatterns: [/^(?:edit|write)\s+(?:file\s+)?(.+)$/i],
        summaryPreference: ['code', 'quoted', 'matched', 'line'],
    },
    {
        aliases: ['web_search', 'web-search', 'search'],
        iconToken: 'search_outlined',
        title: 'Search web',
        sanitizer: 'search',
        paramKeys: ['query', 'q'],
        summaryPatterns: [/^(?:search\s+(?:web\s+)?(?:for|about)|query)\s+(.+)$/i],
        summaryPreference: ['quoted', 'matched', 'line'],
    },
    {
        aliases: ['web_fetch', 'web-fetch', 'fetch'],
        iconToken: 'language_outlined',
        title: 'Fetch web page',
        sanitizer: 'url',
        paramKeys: ['url'],
        summaryPatterns: [/^(?:fetch|open)\s+(?:web\s+page\s+)?(?:from\s+)?(.+)$/i],
        summaryPreference: ['url', 'matched', 'quoted', 'line'],
    },
    {
        aliases: ['grep'],
        iconToken: 'doc-search_outlined',
        title: 'Search text',
        sanitizer: 'generic',
        detailFromParams: (params) => buildPatternDetail(params, { includeTarget: true }),
        summaryPatterns: [/^(?:search\s+text(?:\s+by\s+pattern)?|grep)\s+(.+)$/i],
    },
    {
        aliases: ['glob'],
        iconToken: 'folder_outlined',
        title: 'Search files',
        sanitizer: 'generic',
        paramKeys: ['pattern'],
        summaryPatterns: [/^(?:search\s+files(?:\s+by\s+pattern)?|glob)\s+(.+)$/i],
    },
    {
        aliases: ['exec', 'bash', 'command', 'run'],
        iconToken: 'setting_outlined',
        title: 'Run command',
        sanitizer: 'command',
        paramKeys: ['description', 'command', 'script'],
        summaryPatterns: [/^(?:run|execute)\s+(?:command|script)?\s*(.+)$/i],
        summaryPreference: ['code', 'quoted', 'matched', 'line'],
    },
    {
        aliases: ['browser', 'playwright', 'navigate'],
        iconToken: 'browser-mac_outlined',
        title: 'Browser',
        sanitizer: 'url',
        paramKeys: ['url'],
        summaryPatterns: [/^(?:open|browse|visit|navigate\s+to)\s+(.+)$/i],
        summaryPreference: ['url', 'quoted', 'matched', 'line'],
    },
    {
        aliases: ['agent', 'task', 'spawn'],
        iconToken: 'robot_outlined',
        title: 'Run sub-agent',
        sanitizer: 'generic',
        paramKeys: ['task', 'description', 'prompt'],
        summaryPatterns: [/^(?:run\s+sub-?agent|spawn\s+agent)\s+(.+)$/i],
    },
    {
        aliases: ['check', 'determine', 'verify'],
        iconToken: 'list-check_outlined',
        title: 'Check',
        sanitizer: 'generic',
        paramKeys: ['target', 'subject', 'description'],
    },
    {
        aliases: ['summarize', 'analyze', 'prepare'],
        iconToken: 'report_outlined',
        title: 'Analyze',
        sanitizer: 'generic',
        paramKeys: ['target', 'subject', 'description'],
    },
];
function normalizeToolUseDisplay(params) {
    const traceSteps = params.traceSteps ?? [];
    const showFullPaths = params.showFullPaths === true;
    const showResultDetails = params.showResultDetails === true;
    const sources = traceSteps.map(toTraceSource);
    const steps = sources
        .map((source) => formatToolStep(source, { showFullPaths, showResultDetails }))
        .filter((step) => !!step);
    return {
        content: steps.map((step) => (step.detail ? `- ${step.title}: ${step.detail}` : `- ${step.title}`)).join('\n'),
        stepCount: steps.length,
        steps,
    };
}
function buildToolUseTitleSuffix(params) {
    const { stepCount } = params;
    return {
        zh: `查看 ${stepCount} 个步骤`,
        en: `Show ${stepCount} step${stepCount === 1 ? '' : 's'}`,
    };
}
function toTraceSource(step) {
    return {
        toolName: step.toolName,
        params: step.params,
        result: step.result,
        error: step.error,
        durationMs: step.durationMs,
    };
}
function formatToolStep(source, options) {
    const descriptor = resolveToolDescriptor(source.toolName);
    const rawDetail = (descriptor ? extractDetailFromParams(source.params, descriptor) : undefined) ??
        (descriptor ? extractDetailFromSummary(source.summaryText, descriptor) : cleanupLine(source.summaryText ?? '')) ??
        undefined;
    const detail = rawDetail ? sanitizeToolDetail(descriptor?.sanitizer ?? 'generic', rawDetail, options) : undefined;
    const title = buildToolTitle(source, descriptor, rawDetail);
    const meta = buildStepMeta(source, descriptor, options);
    return {
        title,
        detail: joinDetailParts(detail, meta),
        iconToken: descriptor?.iconToken ?? 'setting-inter_outlined',
    };
}
function buildToolTitle(source, descriptor, rawDetail) {
    const baseTitle = descriptor?.title === 'Read' && rawDetail && isSkillPathValue(rawDetail)
        ? 'Skill Read'
        : (descriptor?.title ?? humanizeToolName(source.toolName ?? 'tool'));
    const durationLabel = source.durationMs != null ? formatDurationLabel(source.durationMs) : undefined;
    return durationLabel ? `${baseTitle} (${durationLabel})` : baseTitle;
}
function resolveToolDescriptor(toolName) {
    const normalizedName = (0, reasoning_utils_1.normalizeToolName)(toolName);
    return TOOL_DESCRIPTORS.find((descriptor) => descriptor.aliases.some((alias) => normalizedName === alias || normalizedName.startsWith(`${alias}_`) || normalizedName.startsWith(`${alias}-`)));
}
function extractDetailFromParams(params, descriptor) {
    if (!params)
        return undefined;
    if (descriptor.detailFromParams)
        return descriptor.detailFromParams(params);
    for (const key of descriptor.paramKeys ?? []) {
        const value = params[key];
        const text = extractScalarText(value);
        if (text)
            return text;
    }
    return undefined;
}
function extractDetailFromSummary(summaryText, descriptor) {
    if (!summaryText)
        return undefined;
    const lines = summaryText
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => cleanupLine(stripMarkdown(line)))
        .filter((line) => line && !isNoiseLine(line));
    for (const line of lines) {
        const signals = buildSummarySignals(line, descriptor.summaryPatterns ?? []);
        const detail = pickSummaryDetail(signals, descriptor.summaryPreference ?? DEFAULT_SUMMARY_PREFERENCE);
        if (detail)
            return detail;
    }
    return undefined;
}
function buildSummarySignals(line, patterns) {
    const matched = patterns
        .map((pattern) => line.match(pattern)?.[1]?.trim())
        .find((value) => Boolean(value));
    return {
        line,
        matched,
        code: extractFirstCodeSpan(line),
        quoted: extractFirstQuotedText(line),
        url: extractFirstUrl(line),
    };
}
function pickSummaryDetail(signals, preference) {
    for (const key of preference) {
        const value = signals[key];
        if (value)
            return value;
    }
    return undefined;
}
function buildStepMeta(source, descriptor, options) {
    const parts = [];
    if (source.error) {
        parts.push(`Failed: ${source.error}`);
    }
    else if (options.showResultDetails) {
        const resultDetail = buildResultDetail(source, descriptor, options);
        if (resultDetail) {
            parts.push(`Result: ${resultDetail}`);
        }
    }
    return parts.length > 0 ? parts.join(' · ') : undefined;
}
function joinDetailParts(detail, meta) {
    if (detail && meta)
        return `${detail} · ${meta}`;
    return detail ?? meta;
}
function buildResultDetail(source, descriptor, options) {
    if (source.result == null)
        return undefined;
    if (descriptor && ['Read', 'Edit', 'Fetch web page', 'Browser'].includes(descriptor.title)) {
        return undefined;
    }
    const raw = asDisplayText(source.result);
    const cleaned = descriptor
        ? sanitizeToolDetail(descriptor.sanitizer, raw, options)
        : sanitizeToolDetail('generic', raw, options);
    return cleaned || undefined;
}
function buildPatternDetail(params, options) {
    const pattern = extractScalarText(params.pattern);
    const target = extractScalarText(params.glob ?? params.path ?? params.file_path);
    if (pattern && target && options.includeTarget) {
        return `${pattern} in ${target}`;
    }
    return pattern ?? target ?? undefined;
}
function extractScalarText(value) {
    if (typeof value === 'string')
        return value.trim() || undefined;
    if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    return undefined;
}
function sanitizeToolDetail(kind, value, options) {
    const cleaned = sanitizeGenericText(value);
    if (!cleaned)
        return undefined;
    switch (kind) {
        case 'skill':
            return (cleaned
                .replace(/^skill\s+/i, '')
                .replace(/[-_]+/g, ' ')
                .trim() || 'skill');
        case 'path':
            return sanitizePathLike(cleaned, options);
        case 'search':
            return stripQuotes(cleaned);
        case 'url':
            return stripQuotes(cleaned).replace(/^from\s+/i, '');
        case 'command':
            return sanitizeCommandLike(cleaned, options);
        case 'generic':
        default:
            return cleaned;
    }
}
function sanitizePathLike(value, options) {
    const cleaned = sanitizeGenericText(value)
        .replace(/^(?:from|file|path)\s+/i, '')
        .trim();
    if (options.showFullPaths)
        return cleaned;
    const skillMatch = cleaned.match(/(?:^|\/)skills\/([^/]+)\//i);
    if (skillMatch?.[1]) {
        return skillMatch[1].replace(/[-_]+/g, ' ').trim() || cleaned;
    }
    const segments = cleaned.split(/[\\/]/).filter(Boolean);
    return segments.at(-1) ?? cleaned;
}
function sanitizeCommandLike(value, options) {
    const cleaned = stripQuotes(value)
        .replace(/^(?:command|script|description)\s+/i, '')
        .replace(/^.*?\s+->\s+/i, '')
        .trim();
    if (!cleaned)
        return 'command';
    const redacted = (0, reasoning_utils_1.redactInlineSecrets)(cleaned);
    return options.showFullPaths ? redacted : redactCommandPaths(redacted);
}
function redactCommandPaths(command) {
    return command
        .split(/(\s+)/)
        .map((segment) => {
        if (!segment || /^\s+$/.test(segment))
            return segment;
        return redactCommandToken(segment);
    })
        .join('');
}
function redactCommandToken(token) {
    const match = token.match(/^([("'`]*)(.*?)([)"'`,;:]*)$/);
    if (!match)
        return token;
    const [, prefix, rawCore, suffix] = match;
    const core = redactPathAssignment(rawCore);
    return `${prefix}${core}${suffix}`;
}
function redactPathAssignment(value) {
    const equalsIndex = value.indexOf('=');
    if (equalsIndex > 0) {
        const left = value.slice(0, equalsIndex + 1);
        const right = value.slice(equalsIndex + 1);
        return `${left}${redactStandalonePath(right)}`;
    }
    return redactStandalonePath(value);
}
function redactStandalonePath(value) {
    if (/^https?:\/\//i.test(value))
        return sanitizeUrlForDisplay(value);
    if (!looksLikePathToken(value))
        return value;
    return basenameFromPath(value);
}
function sanitizeUrlForDisplay(url) {
    try {
        const parsed = new URL(url);
        parsed.username = '';
        parsed.password = '';
        for (const key of [...parsed.searchParams.keys()]) {
            if (/(secret|token|password|key|credential|bearer|auth)/i.test(key)) {
                parsed.searchParams.set(key, '[redacted]');
            }
        }
        return parsed.toString();
    }
    catch {
        return url;
    }
}
function looksLikePathToken(value) {
    return (value.startsWith('~/') ||
        value.startsWith('./') ||
        value.startsWith('../') ||
        value.startsWith('/') ||
        value.includes('/'));
}
function basenameFromPath(value) {
    const cleaned = value.replace(/\\/g, '/').replace(/\/+$/, '');
    const segments = cleaned.split('/').filter(Boolean);
    return segments.at(-1) ?? value;
}
function isSkillPathValue(value) {
    return /(?:^|\/)skills\/[^/]+\//i.test(value);
}
function sanitizeGenericText(value) {
    return value
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function cleanupLine(line) {
    return line
        .replace(/^[-*•]\s*/, '')
        .replace(/^\d+[.)]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function stripMarkdown(line) {
    return line
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/^>\s*/, '')
        .trim();
}
function isNoiseLine(line) {
    return /^(?:completed|complete|done|success|succeeded|running|started|finished|ok)$/i.test(line);
}
function humanizeToolName(name) {
    const cleaned = name.replace(/[-_]+/g, ' ').trim();
    if (!cleaned)
        return 'Tool';
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
function formatDurationLabel(durationMs) {
    return durationMs < 1000 ? `${durationMs} ms` : `${(durationMs / 1000).toFixed(1)} s`;
}
function asDisplayText(value) {
    if (typeof value === 'string')
        return value;
    if (value == null)
        return '';
    if (typeof value !== 'object')
        return String(value);
    try {
        return JSON.stringify(value);
    }
    catch {
        return '';
    }
}
function stripQuotes(value) {
    return value.replace(/^[`'"]+|[`'"]+$/g, '').trim();
}
function extractFirstCodeSpan(value) {
    const match = value.match(/`([^`]+)`/);
    return match?.[1]?.trim() || undefined;
}
function extractFirstQuotedText(value) {
    const match = value.match(/["']([^"']+)["']/);
    return match?.[1]?.trim() || undefined;
}
function extractFirstUrl(value) {
    const match = value.match(/\bhttps?:\/\/[^\s"'`]+/i);
    return match?.[0]?.trim() || undefined;
}
