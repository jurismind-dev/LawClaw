"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * ImageResolver — converts image URLs in markdown to Feishu image keys.
 *
 * Used by StreamingCardController to asynchronously download and upload
 * images referenced via `![alt](https://...)` in model-generated markdown,
 * replacing them with `![alt](img_xxx)` that Feishu cards can render.
 */
import { fetchRemoteImageBuffer, uploadImageLark } from '../messaging/outbound/media';
import { larkLogger } from '../core/lark-logger';
const log = larkLogger('card/image-resolver');
/** Matches complete markdown image syntax: `![alt](value)` */
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
export class ImageResolver {
    /** URL → imageKey for successfully uploaded images. */
    resolved = new Map();
    /** URL → upload Promise for in-flight uploads (dedup). */
    pending = new Map();
    /** URLs that have already failed — skip retries. */
    failed = new Set();
    cfg;
    accountId;
    onImageResolved;
    constructor(opts) {
        this.cfg = opts.cfg;
        this.accountId = opts.accountId;
        this.onImageResolved = opts.onImageResolved;
    }
    /**
     * Synchronously resolve image URLs in markdown text.
     *
     * - `img_xxx` references are kept as-is.
     * - URLs with a cached imageKey are replaced inline.
     * - URLs with an in-flight upload are stripped (will appear after re-flush).
     * - New URLs trigger an async upload and are stripped for now.
     */
    resolveImages(text) {
        if (!text.includes('!['))
            return text;
        return text.replace(IMAGE_RE, (fullMatch, alt, value) => {
            // Already a Feishu image key — keep.
            if (value.startsWith('img_'))
                return fullMatch;
            // Not a remote URL — strip (local paths, data URIs, etc.).
            if (!value.startsWith('http://') && !value.startsWith('https://'))
                return '';
            // Cached — replace with image key.
            const cached = this.resolved.get(value);
            if (cached)
                return `![${alt}](${cached})`;
            // Already failed — don't retry, strip.
            if (this.failed.has(value))
                return '';
            // Upload in progress — strip for now.
            if (this.pending.has(value))
                return '';
            // New URL — kick off async upload, strip for now.
            this.startUpload(value);
            return '';
        });
    }
    /**
     * Resolve all image URLs in text synchronously: trigger uploads for new
     * URLs, wait for all pending uploads, then return text with image keys.
     */
    async resolveImagesAwait(text, timeoutMs) {
        // First pass: trigger uploads for any new URLs
        this.resolveImages(text);
        if (this.pending.size > 0) {
            log.info('resolveImagesAwait: waiting for uploads', { count: this.pending.size, timeoutMs });
            const allUploads = Promise.all(this.pending.values());
            const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs));
            await Promise.race([allUploads, timeout]);
            if (this.pending.size > 0) {
                log.warn('resolveImagesAwait: timed out with pending uploads', {
                    remaining: this.pending.size,
                });
            }
        }
        // Second pass: replace URLs with resolved image keys
        return this.resolveImages(text);
    }
    startUpload(url) {
        const uploadPromise = this.doUpload(url);
        this.pending.set(url, uploadPromise);
    }
    async doUpload(url) {
        try {
            log.info('uploading image', { url });
            const buffer = await fetchRemoteImageBuffer(url);
            const { imageKey } = await uploadImageLark({
                cfg: this.cfg,
                image: buffer,
                imageType: 'message',
                accountId: this.accountId,
            });
            log.info('image uploaded', { url, imageKey });
            this.resolved.set(url, imageKey);
            this.pending.delete(url);
            this.onImageResolved();
            return imageKey;
        }
        catch (err) {
            log.warn('image upload failed', { url, error: String(err) });
            this.pending.delete(url);
            this.failed.add(url);
            return null;
        }
    }
}
