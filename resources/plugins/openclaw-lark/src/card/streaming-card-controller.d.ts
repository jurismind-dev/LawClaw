/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Streaming card controller for the Lark/Feishu channel plugin.
 *
 * Manages the full lifecycle of a streaming CardKit card:
 * idle → creating → streaming → completed / aborted / terminated.
 *
 * Delegates throttling to FlushController and message-unavailable
 * detection to UnavailableGuard.
 */
import type { ReplyPayload } from 'openclaw/plugin-sdk';
import type { CardPhase, StreamingCardDeps, TerminalReason } from './reply-dispatcher-types';
interface TerminalCardTextImageResolver {
    resolveImages(text: string): string;
}
interface TerminalCardContentInput {
    text: string;
    reasoningText?: string;
}
export declare class StreamingCardController {
    private phase;
    private cardKit;
    private text;
    private reasoning;
    private toolUse;
    private readonly flush;
    private readonly guard;
    private readonly imageResolver;
    private createEpoch;
    private _terminalReason;
    private dispatchFullyComplete;
    private cardCreationPromise;
    private disposeShutdownHook;
    private readonly dispatchStartTime;
    private readonly deps;
    private elapsed;
    private needsFooterMetrics;
    private getFooterSessionMetrics;
    constructor(deps: StreamingCardDeps);
    get cardMessageId(): string | null;
    get isTerminalPhase(): boolean;
    /**
     * Whether the card has been explicitly aborted (via abortCard()).
     *
     * Distinct from isTerminalPhase — creation_failed is NOT an abort;
     * it should allow fallthrough to static delivery in the factory.
     */
    get isAborted(): boolean;
    /** Whether the reply pipeline was terminated due to an unavailable message. */
    get isTerminated(): boolean;
    /** Check if the pipeline should skip further operations for this source. */
    shouldSkipForUnavailable(source: string): boolean;
    /** Attempt to terminate the pipeline due to an unavailable message error. */
    terminateIfUnavailable(source: string, err?: unknown): boolean;
    /** Why the controller entered a terminal phase, or null if still active. */
    get terminalReason(): TerminalReason | null;
    /** @internal — exposed for test assertions only. */
    get currentPhase(): CardPhase;
    private get shouldDisplayToolUse();
    private computeToolUseDisplay;
    private get visibleToolUseElapsedMs();
    private computeToolUseTitleSuffix;
    /**
     * Unified callback guard — returns true if the pipeline is active
     * and the callback should proceed.
     *
     * Combines three checks:
     * 1. guard.isTerminated — message recalled/deleted
     * 2. guard.shouldSkip(source) — eagerly detect unavailable messages
     * 3. isTerminalPhase — completed/aborted/terminated/creation_failed
     */
    private shouldProceed;
    private isStaleCreate;
    private transition;
    private onEnterTerminalPhase;
    private markToolUseActivity;
    private captureToolUseElapsed;
    /**
     * Handle a deliver() call in streaming card mode.
     *
     * Accumulates text from the SDK's deliver callbacks to build the
     * authoritative "completedText" for the final card.
     */
    onDeliver(payload: ReplyPayload): Promise<void>;
    onReasoningStream(payload: ReplyPayload): Promise<void>;
    onToolStart(payload: {
        name?: string;
        phase?: string;
    }): Promise<void>;
    onToolPayload(_payload: ReplyPayload): Promise<void>;
    onPartialReply(payload: ReplyPayload): Promise<void>;
    onError(err: unknown, info: {
        kind: string;
    }): Promise<void>;
    onIdle(): Promise<void>;
    markFullyComplete(): void;
    abortCard(): Promise<void>;
    ensureCardCreated(): Promise<void>;
    private performFlush;
    private buildDisplayText;
    private throttledCardUpdate;
    private lastToolUseStatusUpdateTime;
    private throttledToolUseStatusUpdate;
    private updateToolUseStatus;
    private finalizeCard;
    /**
     * Close streaming mode then update card content (shared by onError and abortCard).
     */
    private closeStreamingAndUpdate;
}
/**
 * 终态卡片的正文和 reasoning 都会被飞书按 markdown 渲染，
 * 因此两者都要先做图片替换与表格降级，避免再次撞到 230099/11310。
 */
export declare function prepareTerminalCardContent(content: TerminalCardContentInput, imageResolver: TerminalCardTextImageResolver, tableLimit?: number): TerminalCardContentInput;
export {};
