/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * 时间工具函数 — 对齐 Go 实现 (time.go + timerange.go)
 *
 * 以 ISO 8601 (RFC 3339) 作为标准时间交换格式，
 * 提供 ISO 8601 ↔ Unix 转换工具及时间范围解析。
 */
/** Unix 秒（数字）→ ISO 8601 北京时间 */
export declare function secondsToDateTime(seconds: number): string;
/** Unix 秒（字符串）→ ISO 8601 北京时间 */
export declare function secondsStringToDateTime(seconds: string): string;
/** Unix 毫秒（数字）→ ISO 8601 北京时间 */
export declare function millisToDateTime(millis: number): string;
/** Unix 毫秒（字符串）→ ISO 8601 北京时间 */
export declare function millisStringToDateTime(millis: string): string;
/** ISO 8601 → Unix 秒（数字） */
export declare function dateTimeToSeconds(datetime: string): number;
/** ISO 8601 → Unix 秒（字符串） */
export declare function dateTimeToSecondsString(datetime: string): string;
/** ISO 8601 → Unix 毫秒（数字） */
export declare function dateTimeToMillis(datetime: string): number;
/** ISO 8601 时间范围 */
export interface TimeRange {
    start: string;
    end: string;
}
/**
 * 解析时间范围标识，返回 ISO 8601 字符串对。
 *
 * 支持的格式：
 * - `today` / `yesterday` / `day_before_yesterday`
 * - `this_week` / `last_week` / `this_month` / `last_month`
 * - `last_{N}_{unit}` — unit: minutes / hours / days
 *
 * 所有计算基于北京时间 (UTC+8)。
 */
export declare function parseTimeRange(input: string): TimeRange;
/**
 * 解析时间范围标识，返回 Unix 秒字符串对（供 SDK 调用）。
 */
export declare function parseTimeRangeToSeconds(input: string): {
    start: string;
    end: string;
};
