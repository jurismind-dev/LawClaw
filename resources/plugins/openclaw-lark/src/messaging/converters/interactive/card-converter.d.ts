/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */
import type { ConvertCardResult, Obj, RawCardContent } from './types';
export declare const MODE: {
    readonly Concise: 0;
    readonly Detailed: 1;
};
type Mode = (typeof MODE)[keyof typeof MODE];
export declare class CardConverter {
    private mode;
    private attachment;
    constructor(mode: Mode);
    convert(input: RawCardContent): ConvertCardResult;
    private extractBody;
    private extractHeaderTitle;
    private convertBody;
    convertElements(elements: unknown[], depth: number): string;
    convertElement(elem: Obj, depth: number): string;
    extractProperty(elem: Obj): Obj;
    extractTextContent(textElem: unknown): string;
    private extractTextFromProperty;
    convertPlainText(prop: Obj): string;
    convertMarkdown(prop: Obj): string;
    convertMarkdownV1(elem: Obj, prop: Obj): string;
    convertMarkdownElements(elements: unknown[]): string;
    convertDiv(prop: Obj, _id: string): string;
    convertNote(prop: Obj): string;
    convertLink(prop: Obj): string;
    convertEmoji(prop: Obj): string;
    convertLocalDatetime(prop: Obj): string;
    convertList(prop: Obj): string;
    convertBlockquote(prop: Obj): string;
    convertCodeBlock(prop: Obj): string;
    convertCodeSpan(prop: Obj): string;
    convertHeading(prop: Obj): string;
    convertFallbackText(prop: Obj): string;
    convertTextTag(prop: Obj): string;
    convertNumberTag(prop: Obj): string;
    convertUnknown(prop: Obj | undefined, tag: string): string;
    convertColumnSet(prop: Obj, depth: number): string;
    convertColumn(prop: Obj, depth: number): string;
    convertForm(prop: Obj, _id: string): string;
    convertCollapsiblePanel(prop: Obj, _id: string): string;
    convertInteractiveContainer(prop: Obj, _id: string): string;
    convertRepeat(prop: Obj): string;
    convertButton(prop: Obj, _id: string): string;
    convertActions(prop: Obj): string;
    convertSelect(prop: Obj, _id: string, isMulti: boolean): string;
    convertSelectImg(prop: Obj, _id: string): string;
    convertInput(prop: Obj, _id: string): string;
    convertDatePicker(prop: Obj, _id: string, pickerType: string): string;
    convertChecker(prop: Obj, _id: string): string;
    convertOverflow(prop: Obj): string;
    convertPerson(prop: Obj, _id: string): string;
    convertPersonV1(prop: Obj, _id: string): string;
    convertPersonList(prop: Obj): string;
    convertAvatar(prop: Obj, _id: string): string;
    convertAt(prop: Obj): string;
    convertImage(prop: Obj, _id: string): string;
    convertImgCombination(prop: Obj): string;
    convertChart(prop: Obj, _id: string): string;
    private extractChartSummary;
    private extractLineBarSummary;
    private extractPieSummary;
    private extractGenericSummary;
    convertAudio(prop: Obj, _id: string): string;
    convertVideo(prop: Obj, _id: string): string;
    convertTable(prop: Obj): string;
    private extractTableCellValue;
    private extractTextStyle;
    private applyTextStyle;
    private getImageToken;
}
export {};
