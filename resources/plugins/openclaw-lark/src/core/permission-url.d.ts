/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Permission URL extraction utilities.
 *
 * Shared functions for extracting and processing permission grant URLs
 * from Feishu API error messages.
 */
/**
 * Extract permission grant URL from a Feishu error message and optimize it
 * by keeping only the highest-priority permission.
 *
 * @param msg - The error message containing the grant URL
 * @returns The optimized grant URL with single permission, or empty string if not found
 */
export declare function extractPermissionGrantUrl(msg: string): string;
/**
 * Extract permission scopes from a Feishu error message.
 * Looks for scopes in the format [scope1,scope2,...]
 */
export declare function extractPermissionScopes(msg: string): string;
