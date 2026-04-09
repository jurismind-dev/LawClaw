"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeMediaUrlInput = normalizeMediaUrlInput;
exports.isWindowsAbsolutePath = isWindowsAbsolutePath;
exports.isLocalMediaPath = isLocalMediaPath;
exports.safeFileUrlToPath = safeFileUrlToPath;
exports.validateLocalMediaRoots = validateLocalMediaRoots;
exports.resolveBaseNameFromPath = resolveBaseNameFromPath;
exports.resolveFileNameFromMediaUrl = resolveFileNameFromMediaUrl;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const node_url_1 = require("node:url");
function normalizeMediaUrlInput(value) {
    let raw = value.trim();
    // Common wrappers from markdown/chat payloads.
    if (raw.startsWith('<') && raw.endsWith('>') && raw.length >= 2) {
        raw = raw.slice(1, -1).trim();
    }
    // Strip matching surrounding quotes/backticks.
    const first = raw[0];
    const last = raw[raw.length - 1];
    if (raw.length >= 2 &&
        ((first === '"' && last === '"') || (first === "'" && last === "'") || (first === '`' && last === '`'))) {
        raw = raw.slice(1, -1).trim();
    }
    return raw;
}
function stripQueryAndHash(value) {
    return value.split(/[?#]/, 1)[0] ?? value;
}
function isWindowsAbsolutePath(value) {
    return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
}
function isLocalMediaPath(value) {
    const raw = normalizeMediaUrlInput(value);
    return raw.startsWith('file://') || path.isAbsolute(raw) || isWindowsAbsolutePath(raw);
}
function safeFileUrlToPath(fileUrl) {
    const raw = normalizeMediaUrlInput(fileUrl);
    try {
        return (0, node_url_1.fileURLToPath)(raw);
    }
    catch {
        return new URL(raw).pathname;
    }
}
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
function validateLocalMediaRoots(filePath, localRoots) {
    // Not configured — skip validation (backwards-compatible).
    if (localRoots === undefined)
        return;
    if (localRoots.length === 0) {
        throw new Error(`[feishu-media] Local file access denied for "${filePath}": ` +
            `mediaLocalRoots is configured as an empty array, which blocks all local access. ` +
            `Add allowed directories to mediaLocalRoots or use a remote URL instead.`);
    }
    // Resolve symlinks to prevent traversal via symlinked paths.
    // Fall back to path.resolve when the file does not exist yet — the
    // subsequent readFileSync will report a clear "file not found" error.
    let resolved;
    try {
        resolved = fs.realpathSync(path.resolve(filePath));
    }
    catch {
        resolved = path.resolve(filePath);
    }
    const isAllowed = localRoots.some((root) => {
        let resolvedRoot;
        try {
            resolvedRoot = fs.realpathSync(path.resolve(root));
        }
        catch {
            resolvedRoot = path.resolve(root);
        }
        // Must be exactly the root or strictly inside it (with separator).
        return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep);
    });
    if (!isAllowed) {
        throw new Error(`[feishu-media] Local file access denied for "${filePath}": ` +
            `path is not under any allowed mediaLocalRoots (${localRoots.join(', ')}). ` +
            `Move the file to an allowed directory or use a remote URL instead.`);
    }
}
function resolveBaseNameFromPath(value) {
    const raw = normalizeMediaUrlInput(value);
    const cleanPath = stripQueryAndHash(raw);
    const fileName = isWindowsAbsolutePath(cleanPath) ? path.win32.basename(cleanPath) : path.basename(cleanPath);
    if (fileName && fileName !== '/' && fileName !== '.' && fileName !== '\\') {
        return fileName;
    }
    return undefined;
}
function resolveFileNameFromMediaUrl(mediaUrl) {
    const raw = normalizeMediaUrlInput(mediaUrl);
    if (!raw)
        return undefined;
    if (isLocalMediaPath(raw)) {
        if (raw.startsWith('file://')) {
            const fromFileUrlPath = safeFileUrlToPath(raw);
            const fromFileUrlName = resolveBaseNameFromPath(fromFileUrlPath);
            if (fromFileUrlName)
                return fromFileUrlName;
        }
        return resolveBaseNameFromPath(raw);
    }
    try {
        const parsed = new URL(raw);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            const fromUrlPath = path.posix.basename(parsed.pathname);
            if (fromUrlPath && fromUrlPath !== '/')
                return fromUrlPath;
        }
    }
    catch {
        // Not a valid URL. Continue with file path fallback.
    }
    return resolveBaseNameFromPath(raw);
}
