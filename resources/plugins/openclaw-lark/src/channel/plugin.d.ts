/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * ChannelPlugin interface implementation for the Lark/Feishu channel.
 *
 * This is the top-level entry point that the OpenClaw plugin system uses to
 * discover capabilities, resolve accounts, obtain outbound adapters, and
 * start the inbound event gateway.
 */
import type { ChannelPlugin } from 'openclaw/plugin-sdk';
import type { LarkAccount } from '../core/types';
export declare const feishuPlugin: ChannelPlugin<LarkAccount>;
