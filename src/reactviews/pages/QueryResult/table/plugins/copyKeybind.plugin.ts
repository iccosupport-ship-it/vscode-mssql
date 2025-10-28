/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    ResultSetSummary,
    CopySelectionRequest,
    CopyHeadersRequest,
    CopyAsCsvRequest,
    CopyAsJsonRequest,
    CopyAsInsertIntoRequest,
    CopyAsInClauseRequest,
    SaveResultsWebviewRequest,
    QueryResultSaveAsTrigger,
    ISlickRange,
} from "../../../../../sharedInterfaces/queryResult";
import {
    convertDisplayedSelectionToActual,
    selectEntireGrid,
    tryCombineSelectionsForResults,
} from "../utils";
import { QueryResultReactProvider } from "../../queryResultStateProvider";
import {
    eventMatchesShortcut,
    getShortcutInfo,
    ShortcutInfo,
} from "../../../../common/keyboardUtils";
import {
    WebviewAction,
    WebviewKeyboardShortcutConfiguration,
} from "../../../../../sharedInterfaces/webview";

/**
 * Implements the various clipboard and export keyboard shortcuts for slickgrid
 */
export class CopyKeybind<T extends Slick.SlickData> implements Slick.Plugin<T> {
    private grid!: Slick.Grid<T>;
    private handler = new Slick.EventHandler();
    private uri: string;
    private resultSetSummary: ResultSetSummary;
    private shortcuts!: Record<WebviewAction, ShortcutInfo>;

    constructor(
        uri: string,
        resultSetSummary: ResultSetSummary,
        private _qrContext: QueryResultReactProvider,
        keyBindings: WebviewKeyboardShortcutConfiguration,
    ) {
        this.uri = uri;
        this.resultSetSummary = resultSetSummary;
        this.updateShortcuts(keyBindings);
    }

    public init(grid: Slick.Grid<T>) {
        this.grid = grid;
        this.handler.subscribe(this.grid.onKeyDown, (e: Slick.DOMEvent) =>
            this.handleKeyDown(e as unknown as KeyboardEvent),
        );
    }

    public destroy() {
        this.handler.unsubscribeAll();
    }

    public updateShortcuts(keyBindings: WebviewKeyboardShortcutConfiguration): void {
        this.shortcuts = {
            copySelection: getShortcutInfo(keyBindings[WebviewAction.CopySelection]),
            copyWithHeaders: getShortcutInfo(keyBindings[WebviewAction.CopyWithHeaders]),
            copyAllHeaders: getShortcutInfo(keyBindings[WebviewAction.CopyAllHeaders]),
            copyAsCsv: getShortcutInfo(keyBindings[WebviewAction.CopyAsCsv]),
            copyAsJson: getShortcutInfo(keyBindings[WebviewAction.CopyAsJson]),
            copyAsInsertInto: getShortcutInfo(keyBindings[WebviewAction.CopyAsInsert]),
            copyAsInClause: getShortcutInfo(keyBindings[WebviewAction.CopyAsInClause]),
            saveAsJson: getShortcutInfo(keyBindings[WebviewAction.SaveAsJson]),
            saveAsCsv: getShortcutInfo(keyBindings[WebviewAction.SaveAsCsv]),
            saveAsExcel: getShortcutInfo(keyBindings[WebviewAction.SaveAsExcel]),
            saveAsInsert: getShortcutInfo(keyBindings[WebviewAction.SaveAsInsert]),
        };
    }

    private async handleKeyDown(e: KeyboardEvent): Promise<void> {
        let handled = false;
        if (this.matches(e, this.shortcuts.copySelection)) {
            handled = true;
            await this.copySelection(false);
        } else if (this.matches(e, this.shortcuts.copyWithHeaders)) {
            handled = true;
            await this.copySelection(true);
        } else if (this.matches(e, this.shortcuts.copyAllHeaders)) {
            handled = true;
            await this.copyHeaders();
        } else if (this.matches(e, this.shortcuts.copyAsCsv)) {
            handled = true;
            await this.copyAsCsv();
        } else if (this.matches(e, this.shortcuts.copyAsJson)) {
            handled = true;
            await this.copyAsJson();
        } else if (this.matches(e, this.shortcuts.copyAsInsertInto)) {
            handled = true;
            await this.copyAsInsertInto();
        } else if (this.matches(e, this.shortcuts.copyAsInClause)) {
            handled = true;
            await this.copyAsInClause();
        } else if (this.matches(e, this.shortcuts.saveAsJson)) {
            handled = true;
            await this.saveResults("json");
        } else if (this.matches(e, this.shortcuts.saveAsCsv)) {
            handled = true;
            await this.saveResults("csv");
        } else if (this.matches(e, this.shortcuts.saveAsExcel)) {
            handled = true;
            await this.saveResults("excel");
        } else if (this.matches(e, this.shortcuts.saveAsInsert)) {
            handled = true;
            await this.saveResults("insert");
        }

        if (handled) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    private matches(event: KeyboardEvent, shortcut: ShortcutInfo): boolean {
        return shortcut && Object.keys(shortcut.matcher).length > 0
            ? eventMatchesShortcut(event, shortcut.matcher)
            : false;
    }

    private getConvertedSelection(): ISlickRange[] {
        const selectedRanges = this.grid.getSelectionModel().getSelectedRanges();
        let selection = tryCombineSelectionsForResults(selectedRanges) ?? [];

        if (!selection || selection.length === 0) {
            selection = selectEntireGrid(this.grid);
        }

        return convertDisplayedSelectionToActual(this.grid, selection);
    }

    private async copySelection(includeHeaders?: boolean) {
        const selection = this.getConvertedSelection();

        await this._qrContext.extensionRpc.sendRequest(CopySelectionRequest.type, {
            uri: this.uri,
            batchId: this.resultSetSummary.batchId,
            resultId: this.resultSetSummary.id,
            selection,
            includeHeaders,
        });
    }

    private async copyHeaders() {
        const selection = this.getConvertedSelection();

        await this._qrContext.extensionRpc.sendRequest(CopyHeadersRequest.type, {
            uri: this.uri,
            batchId: this.resultSetSummary.batchId,
            resultId: this.resultSetSummary.id,
            selection,
        });
    }

    private async copyAsCsv() {
        const selection = this.getConvertedSelection();
        await this._qrContext.extensionRpc.sendRequest(CopyAsCsvRequest.type, {
            uri: this.uri,
            batchId: this.resultSetSummary.batchId,
            resultId: this.resultSetSummary.id,
            selection,
        });
    }

    private async copyAsJson() {
        const selection = this.getConvertedSelection();
        await this._qrContext.extensionRpc.sendRequest(CopyAsJsonRequest.type, {
            uri: this.uri,
            batchId: this.resultSetSummary.batchId,
            resultId: this.resultSetSummary.id,
            selection,
            includeHeaders: true,
        });
    }

    private async copyAsInsertInto() {
        const selection = this.getConvertedSelection();
        await this._qrContext.extensionRpc.sendRequest(CopyAsInsertIntoRequest.type, {
            uri: this.uri,
            batchId: this.resultSetSummary.batchId,
            resultId: this.resultSetSummary.id,
            selection,
        });
    }

    private async copyAsInClause() {
        const selection = this.getConvertedSelection();
        await this._qrContext.extensionRpc.sendRequest(CopyAsInClauseRequest.type, {
            uri: this.uri,
            batchId: this.resultSetSummary.batchId,
            resultId: this.resultSetSummary.id,
            selection,
        });
    }

    private async saveResults(format: string) {
        const selection = this.getConvertedSelection();

        await this._qrContext.extensionRpc.sendRequest(SaveResultsWebviewRequest.type, {
            uri: this.uri,
            batchId: this.resultSetSummary.batchId,
            resultId: this.resultSetSummary.id,
            selection,
            format,
            origin: QueryResultSaveAsTrigger.Toolbar,
        });
    }

    public getShortcutDisplays(): {
        copySelection: string;
        copyWithHeaders: string;
        copyAllHeaders: string;
        copyAsCsv: string;
        copyAsJson: string;
        copyAsInsertInto: string;
        copyAsInClause: string;
        saveAsJson: string;
        saveAsCsv: string;
        saveAsExcel: string;
        saveAsInsert: string;
    } {
        return {
            copySelection: this.shortcuts.copySelection.display,
            copyWithHeaders: this.shortcuts.copyWithHeaders.display,
            copyAllHeaders: this.shortcuts.copyAllHeaders.display,
            copyAsCsv: this.shortcuts.copyAsCsv.display,
            copyAsJson: this.shortcuts.copyAsJson.display,
            copyAsInsertInto: this.shortcuts.copyAsInsertInto.display,
            copyAsInClause: this.shortcuts.copyAsInClause.display,
            saveAsJson: this.shortcuts.saveAsJson.display,
            saveAsCsv: this.shortcuts.saveAsCsv.display,
            saveAsExcel: this.shortcuts.saveAsExcel.display,
            saveAsInsert: this.shortcuts.saveAsInsert.display,
        };
    }
}
