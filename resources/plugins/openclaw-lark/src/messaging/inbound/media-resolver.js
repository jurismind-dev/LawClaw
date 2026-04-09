"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadResources = downloadResources;
exports.buildFeishuMediaPayload = buildFeishuMediaPayload;
const lark_client_1 = require("../../core/lark-client.js");
const media_1 = require("../outbound/media.js");
// ---------------------------------------------------------------------------
// Resource-descriptor-based download
// ---------------------------------------------------------------------------
/**
 * Download media files based on pre-extracted ResourceDescriptors from
 * the converter phase.
 */
async function downloadResources(params) {
    const { cfg, messageId, resources, maxBytes, log, accountId } = params;
    if (resources.length === 0)
        return [];
    const out = [];
    const core = lark_client_1.LarkClient.runtime;
    for (const res of resources) {
        try {
            const resourceType = res.type === 'image' ? 'image' : 'file';
            const result = await (0, media_1.downloadMessageResourceFeishu)({
                cfg,
                messageId,
                fileKey: res.fileKey,
                type: resourceType,
                accountId,
            });
            let contentType = result.contentType;
            if (!contentType) {
                contentType = await core.media.detectMime({ buffer: result.buffer });
            }
            const fileName = result.fileName || res.fileName;
            const saved = await core.channel.media.saveMediaBuffer(result.buffer, contentType, 'inbound', maxBytes, fileName);
            const placeholder = inferPlaceholderFromType(res.type);
            out.push({
                path: saved.path,
                contentType: saved.contentType,
                placeholder,
                fileKey: res.fileKey,
                resourceType: res.type,
            });
            log?.(`feishu: downloaded ${res.type} resource ${res.fileKey}, saved to ${saved.path}`);
        }
        catch (err) {
            log?.(`feishu: failed to download ${res.type} resource ${res.fileKey}: ${String(err)}`);
        }
    }
    return out;
}
function inferPlaceholderFromType(type) {
    switch (type) {
        case 'image':
            return '<media:image>';
        case 'file':
            return '<media:document>';
        case 'audio':
            return '<media:audio>';
        case 'video':
            return '<media:video>';
        case 'sticker':
            return '<media:sticker>';
    }
}
// ---------------------------------------------------------------------------
// Media payload builder
// ---------------------------------------------------------------------------
function buildFeishuMediaPayload(mediaList) {
    const first = mediaList[0];
    const mediaPaths = mediaList.map((m) => m.path);
    const mediaTypes = mediaList.map((m) => m.contentType).filter(Boolean);
    return {
        MediaPath: first?.path,
        MediaType: first?.contentType,
        MediaUrl: first?.path,
        MediaPaths: mediaPaths.length > 0 ? mediaPaths : undefined,
        MediaUrls: mediaPaths.length > 0 ? mediaPaths : undefined,
        MediaTypes: mediaTypes.length > 0 ? mediaTypes : undefined,
    };
}
