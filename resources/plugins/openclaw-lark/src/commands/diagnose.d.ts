/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Diagnostic module for the Lark/Feishu plugin.
 *
 * Collects environment info, account configuration, API connectivity,
 * app permissions, tool registration state, and recent error logs into
 * a structured report that users can share with developers for
 * remote troubleshooting.
 */
import type { OpenClawConfig } from 'openclaw/plugin-sdk';
interface DiagLogger {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
}
type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip';
interface DiagCheckResult {
    name: string;
    status: CheckStatus;
    message: string;
    details?: string;
}
interface AccountDiagResult {
    accountId: string;
    name?: string;
    enabled: boolean;
    configured: boolean;
    appId?: string;
    brand: string;
    checks: DiagCheckResult[];
}
interface DiagReport {
    timestamp: string;
    environment: {
        nodeVersion: string;
        platform: string;
        arch: string;
        pluginVersion: string;
    };
    accounts: AccountDiagResult[];
    toolsRegistered: string[];
    recentErrors: string[];
    overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    checks: DiagCheckResult[];
}
export declare function runDiagnosis(params: {
    config: OpenClawConfig;
    logger?: DiagLogger;
}): Promise<DiagReport>;
export declare function formatDiagReportText(report: DiagReport): string;
/**
 * Extract all log lines tagged with a specific message_id from gateway.log.
 *
 * Scans the last 1MB of the log file for lines containing `[msg:{messageId}]`.
 * Returns matching lines in chronological order.
 */
export declare function traceByMessageId(messageId: string): Promise<string[]>;
/**
 * Format trace output for CLI display.
 */
export declare function formatTraceOutput(lines: string[], messageId: string): string;
/**
 * Analyze trace log lines and produce a structured CLI report.
 */
export declare function analyzeTrace(lines: string[], _messageId: string): string;
export declare function formatDiagReportCli(report: DiagReport): string;
export {};
