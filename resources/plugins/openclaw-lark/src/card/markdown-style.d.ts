/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Markdown 样式优化工具
 */
/**
 * 优化 Markdown 样式：
 * - 标题降级：H1 → H4，H2~H6 → H5
 * - 表格前后增加段落间距
 * - 有序列表：序号后确保只有一个空格
 * - 无序列表："- " 格式规范化（跳过分隔线 ---）
 * - 表格：单元格前后补空格，分隔符行规范化，表格前后加空行
 * - 代码块内容不受影响
 */
export declare function optimizeMarkdownStyle(text: string, cardVersion?: number): string;
