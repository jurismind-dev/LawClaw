/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Media handling for the Lark/Feishu channel plugin.
 *
 * Provides functions for downloading images and file resources from
 * Feishu messages, uploading media to the Feishu IM storage, and
 * sending image / file messages to chats.
 */
import type { OpenClawConfig } from 'openclaw/plugin-sdk';
/**
 * Result of downloading an image from Feishu.
 */
export interface DownloadImageResult {
    /** The raw image bytes. */
    buffer: Buffer;
    /** The MIME type of the image (e.g. "image/png"), if known. */
    contentType?: string;
}
/**
 * Result of downloading a message resource (image or file) from Feishu.
 */
export interface DownloadMessageResourceResult {
    /** The raw file bytes. */
    buffer: Buffer;
    /** The MIME type of the resource, if known. */
    contentType?: string;
    /** The original file name, if available. */
    fileName?: string;
}
/**
 * Result of uploading an image to Feishu.
 */
export interface UploadImageResult {
    /** The image_key assigned by Feishu, used to reference the image. */
    imageKey: string;
}
/**
 * Result of uploading a file to Feishu.
 */
export interface UploadFileResult {
    /** The file_key assigned by Feishu, used to reference the file. */
    fileKey: string;
}
/**
 * Result of sending a media (image or file) message.
 */
export interface SendMediaResult {
    /** Platform-assigned message ID. */
    messageId: string;
    /** Chat ID where the media was sent. */
    chatId: string;
}
/**
 * Download a resource (image or file) attached to a specific message.
 *
 * @param params.cfg       - Plugin configuration.
 * @param params.messageId - The message the resource belongs to.
 * @param params.fileKey   - The file_key or image_key of the resource.
 * @param params.type      - Whether the resource is an "image" or "file".
 * @param params.accountId - Optional account identifier.
 * @returns The resource buffer, content type, and file name.
 */
export declare function downloadMessageResourceFeishu(params: {
    cfg: OpenClawConfig;
    messageId: string;
    fileKey: string;
    type: 'image' | 'file';
    accountId?: string;
}): Promise<DownloadMessageResourceResult>;
/**
 * Upload an image to Feishu IM storage.
 *
 * Accepts either a Buffer containing the raw image bytes or a file
 * system path to read from.
 *
 * @param params.cfg       - Plugin configuration.
 * @param params.image     - A Buffer or local file path for the image.
 * @param params.imageType - The image usage type: "message" (default) or "avatar".
 * @param params.accountId - Optional account identifier.
 * @returns The assigned image_key.
 */
export declare function uploadImageLark(params: {
    cfg: OpenClawConfig;
    image: Buffer | string;
    imageType?: 'message' | 'avatar';
    accountId?: string;
}): Promise<UploadImageResult>;
/**
 * Upload a file to Feishu IM storage.
 *
 * @param params.cfg       - Plugin configuration.
 * @param params.file      - A Buffer or local file path.
 * @param params.fileName  - The display name of the file.
 * @param params.fileType  - Feishu file type: "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream".
 * @param params.duration  - Duration in milliseconds (for audio/video files).
 * @param params.accountId - Optional account identifier.
 * @returns The assigned file_key.
 */
export declare function uploadFileLark(params: {
    cfg: OpenClawConfig;
    file: Buffer | string;
    fileName: string;
    fileType: 'opus' | 'mp4' | 'pdf' | 'doc' | 'xls' | 'ppt' | 'stream';
    duration?: number;
    accountId?: string;
}): Promise<UploadFileResult>;
/**
 * Send an image message to a chat or user.
 *
 * @param params.cfg              - Plugin configuration.
 * @param params.to               - Target identifier.
 * @param params.imageKey         - The image_key from a previous upload.
 * @param params.replyToMessageId - Optional message ID for threaded reply.
 * @param params.replyInThread    - When true, reply appears in thread.
 * @param params.accountId        - Optional account identifier.
 * @returns The send result.
 */
export declare function sendImageLark(params: {
    cfg: OpenClawConfig;
    to: string;
    imageKey: string;
    replyToMessageId?: string;
    replyInThread?: boolean;
    accountId?: string;
}): Promise<SendMediaResult>;
/**
 * Send a file message to a chat or user.
 *
 * @param params.cfg              - Plugin configuration.
 * @param params.to               - Target identifier.
 * @param params.fileKey          - The file_key from a previous upload.
 * @param params.replyToMessageId - Optional message ID for threaded reply.
 * @param params.replyInThread    - When true, reply appears in thread.
 * @param params.accountId        - Optional account identifier.
 * @returns The send result.
 */
export declare function sendFileLark(params: {
    cfg: OpenClawConfig;
    to: string;
    fileKey: string;
    replyToMessageId?: string;
    replyInThread?: boolean;
    accountId?: string;
}): Promise<SendMediaResult>;
/**
 * Send a video message to a chat or user.
 *
 * Uses `msg_type: "media"` so Feishu renders the message as a playable
 * video instead of a file attachment.
 *
 * @param params.cfg              - Plugin configuration.
 * @param params.to               - Target identifier.
 * @param params.fileKey          - The file_key from a previous upload.
 * @param params.replyToMessageId - Optional message ID for threaded reply.
 * @param params.replyInThread    - When true, reply appears in thread.
 * @param params.accountId        - Optional account identifier.
 * @returns The send result.
 */
export declare function sendVideoLark(params: {
    cfg: OpenClawConfig;
    to: string;
    fileKey: string;
    replyToMessageId?: string;
    replyInThread?: boolean;
    accountId?: string;
}): Promise<SendMediaResult>;
/**
 * Send an audio message to a chat or user.
 *
 * Uses `msg_type: "audio"` so Feishu renders the message as a playable
 * voice bubble instead of a file attachment.
 *
 * @param params.cfg              - Plugin configuration.
 * @param params.to               - Target identifier.
 * @param params.fileKey          - The file_key from a previous upload.
 * @param params.replyToMessageId - Optional message ID for threaded reply.
 * @param params.replyInThread    - When true, reply appears in thread.
 * @param params.accountId        - Optional account identifier.
 * @returns The send result.
 */
export declare function sendAudioLark(params: {
    cfg: OpenClawConfig;
    to: string;
    fileKey: string;
    replyToMessageId?: string;
    replyInThread?: boolean;
    accountId?: string;
}): Promise<SendMediaResult>;
/**
 * Detect the Feishu file type from a file name extension.
 *
 * Returns one of the Feishu-supported file type strings, or "stream"
 * as a catch-all for unrecognised extensions.
 *
 * @param fileName - The file name (with extension).
 * @returns The detected file type.
 */
export declare function detectFileType(fileName: string): 'opus' | 'mp4' | 'pdf' | 'doc' | 'xls' | 'ppt' | 'stream';
/**
 * Parse the duration (in milliseconds) from an OGG/Opus audio buffer.
 *
 * Scans backward from the end of the buffer to find the last OggS page
 * header, reads the granule position (absolute sample count), and divides
 * by 48 000 (the Opus standard sample rate) then converts to milliseconds.
 *
 * Returns `undefined` when the buffer cannot be parsed (e.g. truncated or
 * not actually OGG).  This is intentionally lenient so callers can fall
 * back gracefully.
 */
export declare function parseOggOpusDuration(buffer: Buffer): number | undefined;
/**
 * Parse the duration (in milliseconds) from an MP4 video buffer.
 *
 * Scans top-level boxes to locate the `moov` container, then finds the
 * `mvhd` (Movie Header) box inside it.  The `mvhd` box stores:
 *   - **timescale**: number of time-units per second
 *   - **duration**: total duration in those time-units
 *
 * Supports both version-0 (32-bit fields) and version-1 (64-bit fields)
 * of the `mvhd` box.
 *
 * Returns `undefined` when the buffer cannot be parsed (e.g. truncated,
 * `moov` at end of a huge file not fully buffered, or not actually MP4).
 */
export declare function parseMp4Duration(buffer: Buffer): number | undefined;
/**
 * Upload and send a media file (image or general file) in one step.
 *
 * Accepts either a URL (remote or local `file://`) or a raw Buffer.
 * The function determines whether the media is an image (by extension)
 * and uses the appropriate upload/send path.
 *
 * @param params.cfg              - Plugin configuration.
 * @param params.to               - Target identifier.
 * @param params.mediaUrl         - URL of the media (http/https or local path).
 * @param params.mediaBuffer      - Raw bytes of the media (alternative to URL).
 * @param params.fileName         - File name (used for type detection and display).
 * @param params.replyToMessageId - Optional message ID for threaded reply.
 * @param params.accountId        - Optional account identifier.
 * @returns The send result.
 */
export declare function uploadAndSendMediaLark(params: {
    cfg: OpenClawConfig;
    to: string;
    mediaUrl?: string;
    mediaBuffer?: Buffer;
    fileName?: string;
    replyToMessageId?: string;
    replyInThread?: boolean;
    accountId?: string;
    /** Allowed root directories for local file access (SSRF prevention). */
    mediaLocalRoots?: readonly string[];
}): Promise<SendMediaResult>;
/**
 * Fetch remote image bytes by URL (http/https only).
 * Local file access is denied. Includes SSRF protection.
 */
export declare function fetchRemoteImageBuffer(url: string): Promise<Buffer>;
