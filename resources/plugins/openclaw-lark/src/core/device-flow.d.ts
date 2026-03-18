/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * OAuth 2.0 Device Authorization Grant (RFC 8628) for Lark/Feishu.
 *
 * Two-step flow:
 *   1. `requestDeviceAuthorization` – obtains device_code + user_code.
 *   2. `pollDeviceToken` – polls the token endpoint until the user authorises,
 *      rejects, or the code expires.
 *
 * All HTTP calls use the built-in `fetch` (Node 18+). The Lark SDK is not
 * used here because these OAuth endpoints are outside the SDK's scope.
 */
import type { LarkBrand } from './types';
export interface DeviceAuthResponse {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    verificationUriComplete: string;
    expiresIn: number;
    interval: number;
}
export interface DeviceFlowTokenData {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
    scope: string;
}
export type DeviceFlowResult = {
    ok: true;
    token: DeviceFlowTokenData;
} | {
    ok: false;
    error: DeviceFlowError;
    message: string;
};
export type DeviceFlowError = 'authorization_pending' | 'slow_down' | 'access_denied' | 'expired_token';
/**
 * Resolve the two OAuth endpoint URLs based on the configured brand.
 */
export declare function resolveOAuthEndpoints(brand: LarkBrand): {
    deviceAuthorization: string;
    token: string;
};
/**
 * Request a device authorisation code from the Feishu OAuth server.
 *
 * Uses Confidential Client authentication (HTTP Basic with appId:appSecret).
 * The `offline_access` scope is automatically appended so that the token
 * response includes a refresh_token.
 */
export declare function requestDeviceAuthorization(params: {
    appId: string;
    appSecret: string;
    brand: LarkBrand;
    scope?: string;
}): Promise<DeviceAuthResponse>;
/**
 * Poll the token endpoint until the user authorises, rejects, or the code
 * expires.
 *
 * Handles `authorization_pending` (keep polling), `slow_down` (back off by
 * +5 s), `access_denied` and `expired_token` (terminal errors).
 *
 * Pass an `AbortSignal` to cancel polling from the outside.
 */
export declare function pollDeviceToken(params: {
    appId: string;
    appSecret: string;
    brand: LarkBrand;
    deviceCode: string;
    interval: number;
    expiresIn: number;
    signal?: AbortSignal;
}): Promise<DeviceFlowResult>;
