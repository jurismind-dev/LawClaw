/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Unified card API error handling.
 *
 * Provides structured error class for CardKit API responses, sub-error
 * parsing for the generic 230099 code, and helper predicates used by
 * reply-dispatcher and streaming-card-controller.
 */
/** 卡片 API 级别错误码。 */
export declare const CARD_ERROR: {
    /** 发送频率限制 */
    readonly RATE_LIMITED: 230020;
    /** 卡片内容创建失败（通用码，需检查子错误） */
    readonly CARD_CONTENT_FAILED: 230099;
};
/** 230099 子错误码，嵌套在 msg 的 ErrCode 字段中。 */
export declare const CARD_CONTENT_SUB_ERROR: {
    /** 卡片元素（表格等）数量超限 */
    readonly ELEMENT_LIMIT: 11310;
};
export declare const FEISHU_CARD_TABLE_LIMIT = 3;
export interface MarkdownTableMatch {
    index: number;
    length: number;
    raw: string;
}
/** CardKit API 返回非零 code 时的结构化错误。 */
export declare class CardKitApiError extends Error {
    readonly code: number;
    readonly msg: string;
    constructor(params: {
        api: string;
        code: number;
        msg: string;
        context: string;
    });
}
/**
 * 从 msg 字符串中提取子错误码。
 *
 * 示例输入: "Failed to create card content, ext=ErrCode: 11310; ErrMsg: element exceeds the limit; code:230099"
 * 返回 11310 或 null。
 */
export declare function extractSubCode(msg: string): number | null;
/**
 * 从任意抛错对象中解析卡片 API 错误结构。
 *
 * 返回 { code, subCode, errMsg }，如果无法提取 code 则返回 null。
 */
export declare function parseCardApiError(err: unknown): {
    code: number;
    subCode: number | null;
    errMsg: string;
} | null;
/**
 * 判断错误是否为卡片表格数量超限。
 *
 * 匹配条件：code 230099 + subCode 11310 + errMsg 含 "table number over limit"。
 * 11310 是通用的元素超限码（也覆盖模板可见性、组件上限等），
 * 必须同时检查 errMsg 确认是表格数量导致的。
 *
 * 实际错误格式（生产日志 2026-03-13）：
 * "Failed to create card content, ext=ErrCode: 11310; ErrMsg: card table number over limit; ErrorValue: table; "
 */
export declare function isCardTableLimitError(err: unknown): boolean;
/** 判断错误是否为卡片发送频率限制（230020）。 */
export declare function isCardRateLimitError(err: unknown): boolean;
/**
 * 收集正文里可被飞书卡片实际渲染的 markdown 表格。
 *
 * 代码块里的示例表格不会被飞书解析成卡片表格元素，因此这里要先排除，
 * 让 shouldUseCard() 预检和 sanitizeTextForCard() 降级逻辑使用同一份结果。
 */
export declare function findMarkdownTablesOutsideCodeBlocks(text: string): MarkdownTableMatch[];
/**
 * 对多段 markdown 文本共享一个表格预算。
 *
 * 段落按数组顺序消耗额度，适合处理“reasoning + 正文”这类会被飞书
 * 作为同一张卡片渲染的多块文本。
 */
export declare function sanitizeTextSegmentsForCard(texts: readonly string[], tableLimit?: number): string[];
/**
 * 对正文中超出 tableLimit 的 markdown 表格降级为 code block，
 * 避免飞书卡片因表格数超限触发 230099/11310。
 *
 * 前 tableLimit 张表格保持原样（可正常卡片渲染）；
 * 超出部分用反引号包裹，阻止飞书将其解析为卡片表格元素。
 */
export declare function sanitizeTextForCard(text: string, tableLimit?: number): string;
