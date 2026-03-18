/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Types and constants for the interactive (card) converter.
 */
export type Obj = Record<string, unknown>;
export interface RawCardContent {
    json_card: string;
    json_attachment?: string;
    card_schema?: number;
}
export interface ConvertCardResult {
    content: string;
    schema: number;
}
export interface TextStyle {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
}
export declare const EMOJI_MAP: Record<string, string>;
export declare const CHART_TYPE_NAMES: Record<string, string>;
