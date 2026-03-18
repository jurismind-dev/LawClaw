/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Legacy groupAllowFrom migration for Feishu onboarding.
 *
 * Handles the migration of chat_id entries (oc_xxx) from
 * groupAllowFrom to the groups config, preserving the original
 * semantic of "allow this group for any sender".
 */
import type { ClawdbotConfig, WizardPrompter } from 'openclaw/plugin-sdk';
/**
 * Detect and migrate legacy chat_id entries in groupAllowFrom.
 *
 * Old semantic: groupAllowFrom contained chat_ids (oc_xxx) to control
 * which groups could use the bot.
 * New semantic: groupAllowFrom is for sender filtering (open_ids like ou_xxx).
 *
 * This function prompts the user and, if confirmed, moves chat_ids
 * to the groups config and keeps only sender IDs in groupAllowFrom.
 */
export declare function migrateLegacyGroupAllowFrom(params: {
    cfg: ClawdbotConfig;
    prompter: WizardPrompter;
}): Promise<ClawdbotConfig>;
