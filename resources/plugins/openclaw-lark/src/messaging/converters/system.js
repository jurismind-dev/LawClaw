"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "system" message type.
 *
 * System messages use a template string with placeholders like
 * `{from_user}`, `{to_chatters}`, `{divider_text}` that are replaced
 * with actual values from the message body.
 */
import { safeParse } from './utils';
export const convertSystem = (raw) => {
    const parsed = safeParse(raw);
    if (!parsed?.template) {
        return { content: '[system message]', resources: [] };
    }
    let content = parsed.template;
    const replacements = {
        '{from_user}': parsed.from_user?.length ? parsed.from_user.filter(Boolean).join(', ') : undefined,
        '{to_chatters}': parsed.to_chatters?.length ? parsed.to_chatters.filter(Boolean).join(', ') : undefined,
        '{divider_text}': parsed.divider_text?.text,
    };
    for (const [placeholder, value] of Object.entries(replacements)) {
        if (value != null) {
            content = content.replaceAll(placeholder, value);
        }
        else {
            content = content.replaceAll(placeholder, '');
        }
    }
    return { content: content.trim(), resources: [] };
};
