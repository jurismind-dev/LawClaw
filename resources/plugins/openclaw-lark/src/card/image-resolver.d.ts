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
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
export interface ImageResolverOptions {
    cfg: ClawdbotConfig;
    accountId: string | undefined;
    /** Called when a previously-pending image upload completes. */
    onImageResolved: () => void;
}
export declare class ImageResolver {
    /** URL → imageKey for successfully uploaded images. */
    private readonly resolved;
    /** URL → upload Promise for in-flight uploads (dedup). */
    private readonly pending;
    /** URLs that have already failed — skip retries. */
    private readonly failed;
    private readonly cfg;
    private readonly accountId;
    private readonly onImageResolved;
    constructor(opts: ImageResolverOptions);
    /**
     * Synchronously resolve image URLs in markdown text.
     *
     * - `img_xxx` references are kept as-is.
     * - URLs with a cached imageKey are replaced inline.
     * - URLs with an in-flight upload are stripped (will appear after re-flush).
     * - New URLs trigger an async upload and are stripped for now.
     */
    resolveImages(text: string): string;
    /**
     * Resolve all image URLs in text synchronously: trigger uploads for new
     * URLs, wait for all pending uploads, then return text with image keys.
     */
    resolveImagesAwait(text: string, timeoutMs: number): Promise<string>;
    private startUpload;
    private doUpload;
}
