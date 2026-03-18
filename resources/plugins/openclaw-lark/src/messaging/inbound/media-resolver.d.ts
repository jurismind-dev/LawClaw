/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Media resolution and payload building for inbound Feishu messages.
 *
 * Downloads media files based on ResourceDescriptors extracted during
 * the content converter phase, and builds the payload object spread
 * into the agent envelope.
 */
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
import type { FeishuMediaInfo, ResourceDescriptor } from '../types';
/**
 * Download media files based on pre-extracted ResourceDescriptors from
 * the converter phase.
 */
export declare function downloadResources(params: {
    cfg: ClawdbotConfig;
    messageId: string;
    resources: ResourceDescriptor[];
    maxBytes: number;
    log?: (msg: string) => void;
    accountId?: string;
}): Promise<FeishuMediaInfo[]>;
export declare function buildFeishuMediaPayload(mediaList: FeishuMediaInfo[]): {
    MediaPath?: string;
    MediaType?: string;
    MediaUrl?: string;
    MediaPaths?: string[];
    MediaUrls?: string[];
    MediaTypes?: string[];
};
