"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Content converter mapping for all Feishu message types.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.converters = void 0;
const text_1 = require("./text.js");
const post_1 = require("./post.js");
const image_1 = require("./image.js");
const file_1 = require("./file.js");
const audio_1 = require("./audio.js");
const video_1 = require("./video.js");
const sticker_1 = require("./sticker.js");
const index_1 = require("./interactive/index.js");
const share_1 = require("./share.js");
const location_1 = require("./location.js");
const merge_forward_1 = require("./merge-forward.js");
const folder_1 = require("./folder.js");
const system_1 = require("./system.js");
const hongbao_1 = require("./hongbao.js");
const calendar_1 = require("./calendar.js");
const video_chat_1 = require("./video-chat.js");
const todo_1 = require("./todo.js");
const vote_1 = require("./vote.js");
const unknown_1 = require("./unknown.js");
exports.converters = new Map([
    ['text', text_1.convertText],
    ['post', post_1.convertPost],
    ['image', image_1.convertImage],
    ['file', file_1.convertFile],
    ['audio', audio_1.convertAudio],
    ['video', video_1.convertVideo],
    ['media', video_1.convertVideo],
    ['sticker', sticker_1.convertSticker],
    ['interactive', index_1.convertInteractive],
    ['share_chat', share_1.convertShareChat],
    ['share_user', share_1.convertShareUser],
    ['location', location_1.convertLocation],
    ['merge_forward', merge_forward_1.convertMergeForward],
    ['folder', folder_1.convertFolder],
    ['system', system_1.convertSystem],
    ['hongbao', hongbao_1.convertHongbao],
    ['share_calendar_event', calendar_1.convertShareCalendarEvent],
    ['calendar', calendar_1.convertCalendar],
    ['general_calendar', calendar_1.convertGeneralCalendar],
    ['video_chat', video_chat_1.convertVideoChat],
    ['todo', todo_1.convertTodo],
    ['vote', vote_1.convertVote],
    ['unknown', unknown_1.convertUnknown],
]);
