/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * UAT (User Access Token) persistent storage with cross-platform support.
 *
 * Stores OAuth token data using OS-native credential services so that tokens
 * survive process restarts without introducing plain-text local files.
 *
 * Platform backends:
 *   macOS   – Keychain Access via `security` CLI
 *   Linux   – AES-256-GCM encrypted files (XDG_DATA_HOME)
 *   Windows – AES-256-GCM encrypted files (%LOCALAPPDATA%)
 *
 * Storage layout:
 *   Service  = "openclaw-feishu-uat"
 *   Account  = "{appId}:{userOpenId}"
 *   Password = JSON-serialised StoredUAToken
 */
export interface StoredUAToken {
    userOpenId: string;
    appId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    refreshExpiresAt: number;
    scope: string;
    grantedAt: number;
}
/** Mask a token for safe logging: only the last 4 chars are visible. */
export declare function maskToken(token: string): string;
/**
 * Read the stored UAT for a given (appId, userOpenId) pair.
 * Returns `null` when no entry exists or the payload is unparseable.
 */
export declare function getStoredToken(appId: string, userOpenId: string): Promise<StoredUAToken | null>;
/**
 * Persist a UAT using the platform credential store.
 *
 * Overwrites any existing entry for the same (appId, userOpenId).
 */
export declare function setStoredToken(token: StoredUAToken): Promise<void>;
/**
 * Remove a stored UAT from the credential store.
 */
export declare function removeStoredToken(appId: string, userOpenId: string): Promise<void>;
/**
 * Determine the freshness of a stored token.
 *
 * - `"valid"`         – access_token is still good (expires > 5 min from now)
 * - `"needs_refresh"` – access_token expired/expiring but refresh_token is valid
 * - `"expired"`       – both tokens are expired; re-authorization required
 */
export declare function tokenStatus(token: StoredUAToken): 'valid' | 'needs_refresh' | 'expired';
