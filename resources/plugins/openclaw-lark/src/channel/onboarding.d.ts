/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Onboarding wizard adapter for the Lark/Feishu channel plugin.
 *
 * Implements the ChannelOnboardingAdapter interface so the `openclaw
 * setup` wizard can configure Feishu credentials, domain, group
 * policies, and DM allowlists interactively.
 */
import type { ChannelOnboardingAdapter } from 'openclaw/plugin-sdk';
export declare const feishuOnboardingAdapter: ChannelOnboardingAdapter;
