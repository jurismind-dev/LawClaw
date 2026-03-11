/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * 插件版本号管理
 *
 * 从 package.json 读取版本号并生成 User-Agent 字符串。
 */
/**
 * 获取插件版本号（从 package.json 读取）
 *
 * @returns 版本号字符串，如 "2026.2.28.5"；读取失败返回 "unknown"
 */
export declare function getPluginVersion(): string;
/**
 * 生成 User-Agent 字符串
 *
 * @returns User-Agent 字符串，格式：`feishu-openclaw-plugin/{version}`
 *
 * @example
 * ```typescript
 * getUserAgent() // => "feishu-openclaw-plugin/2026.2.28.5"
 * ```
 */
export declare function getUserAgent(): string;
//# sourceMappingURL=version.d.ts.map