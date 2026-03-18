"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Common response type helpers for Lark SDK.
 *
 * The Lark Node SDK's generic response types often lack specific field
 * definitions for `data`, requiring `as any` casts.  These lightweight
 * interfaces let us replace `(res.data as any)?.items` with a single typed
 * assertion at the top of each block.
 */
export {};
