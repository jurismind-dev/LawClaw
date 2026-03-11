/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */
export declare function normalizeMediaUrlInput(value: string): string;
export declare function isWindowsAbsolutePath(value: string): boolean;
export declare function isLocalMediaPath(value: string): boolean;
export declare function safeFileUrlToPath(fileUrl: string): string;
/**
 * Validate that a resolved local file path falls under one of the
 * allowed root directories.  Prevents path-traversal attacks when
 * the AI or an external payload supplies a local media path.
 *
 * Semantics:
 * - **`undefined`** — caller has not opted in to restriction; the
 *   function is a no-op so existing behaviour is preserved.  The
 *   caller should log a warning independently.
 * - **`[]` (empty array)** — explicitly configured with no allowed
 *   roots → all local access is denied.
 * - **Non-empty array** — standard allowlist check.
 *
 * @param filePath   - Resolved absolute path to validate.
 * @param localRoots - Allowed root directories.
 * @throws {Error} When the path is not under any allowed root, or
 *                 when `localRoots` is an empty array.
 */
export declare function validateLocalMediaRoots(filePath: string, localRoots: readonly string[] | undefined): void;
export declare function resolveBaseNameFromPath(value: string): string | undefined;
export declare function resolveFileNameFromMediaUrl(mediaUrl: string): string | undefined;
//# sourceMappingURL=media-url-utils.d.ts.map