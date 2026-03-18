/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_doc_media tool -- 文档媒体管理（插入 + 下载）
 *
 * Actions:
 *   insert   - 在飞书文档末尾插入本地图片或文件（3 步流程）
 *   download - 下载文档素材或画板缩略图到本地
 *
 * 使用以下 SDK 接口:
 * - sdk.docx.documentBlockChildren.create - 创建子块
 * - sdk.drive.v1.media.uploadAll - 上传素材
 * - sdk.docx.documentBlock.batchUpdate - 批量更新块
 * - sdk.drive.v1.media.download - 下载素材
 * - sdk.board.v1.whiteboard.downloadAsImage - 下载画板缩略图
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerDocMediaTool(api: OpenClawPluginApi): void;
