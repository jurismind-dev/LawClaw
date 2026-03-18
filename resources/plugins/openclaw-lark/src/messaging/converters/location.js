"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "location" message type.
 */
import { safeParse } from './utils';
export const convertLocation = (raw) => {
    const parsed = safeParse(raw);
    const name = parsed?.name ?? '';
    const lat = parsed?.latitude ?? '';
    const lng = parsed?.longitude ?? '';
    const nameAttr = name ? ` name="${name}"` : '';
    const coordsAttr = lat && lng ? ` coords="lat:${lat},lng:${lng}"` : '';
    return {
        content: `<location${nameAttr}${coordsAttr}/>`,
        resources: [],
    };
};
