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
    kbCopyAllHeaders,
    kbCopyAsCsv,
    kbCopyAsInClause,
    kbCopyAsInsert,
    kbCopyAsJson,
    kbCopySelection,
    kbCopyWithHeaders,
    kbSaveAsCsv,
    kbSaveAsExcel,
    kbSaveAsInsert,
    kbSaveAsJson,
} from "../../../../common/constants";
import {
    eventMatchesShortcut,
    getShortcutInfo,
    ShortcutInfo,
} from "../../../../common/keyboardUtils";

interface CopyShortcutMap {
    copySelection: ShortcutInfo;
    copyWithHeaders: ShortcutInfo;
    copyAllHeaders: ShortcutInfo;
    copyAsCsv: ShortcutInfo;
    copyAsJson: ShortcutInfo;
    copyAsInsertInto: ShortcutInfo;
    copyAsInClause: ShortcutInfo;
    saveAsJson: ShortcutInfo;
    saveAsCsv: ShortcutInfo;
    saveAsExcel: ShortcutInfo;
    saveAsInsert: ShortcutInfo;
}

/**
 * Implements the various clipboard and export keyboard shortcuts for slickgrid
 */
export class CopyKeybind<T extends Slick.SlickData> implements Slick.Plugin<T> {
    private grid!: Slick.Grid<T>;
    private handler = new Slick.EventHandler();
    private uri: string;
    private resultSetSummary: ResultSetSummary;
    private shortcuts!: CopyShortcutMap;

    constructor(
        uri: string,
        resultSetSummary: ResultSetSummary,
        private _qrContext: QueryResultReactProvider,
        keyBindings?: Record<string, string>,
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

    public updateShortcuts(keyBindings?: Record<string, string>): void {
        const getBinding = (key: string) => keyBindings?.[key];

        this.shortcuts = {
            copySelection: getShortcutInfo(getBinding(kbCopySelection), "ctrlcmd+c"),
            copyWithHeaders: getShortcutInfo(getBinding(kbCopyWithHeaders), "ctrlcmd+shift+c"),
            copyAllHeaders: getShortcutInfo(getBinding(kbCopyAllHeaders), "ctrlcmd+alt+shift+c"),
            copyAsCsv: getShortcutInfo(getBinding(kbCopyAsCsv), "ctrlcmd+shift+1"),
            copyAsJson: getShortcutInfo(getBinding(kbCopyAsJson), "ctrlcmd+shift+2"),
            copyAsInsertInto: getShortcutInfo(getBinding(kbCopyAsInsert), "ctrlcmd+shift+3"),
            copyAsInClause: getShortcutInfo(getBinding(kbCopyAsInClause), "ctrlcmd+shift+4"),
            saveAsJson: getShortcutInfo(getBinding(kbSaveAsJson), "ctrlcmd+alt+j"),
            saveAsCsv: getShortcutInfo(getBinding(kbSaveAsCsv), "ctrlcmd+alt+shift+s"),
            saveAsExcel: getShortcutInfo(getBinding(kbSaveAsExcel), "ctrlcmd+alt+shift+e"),
            saveAsInsert: getShortcutInfo(getBinding(kbSaveAsInsert), "ctrlcmd+alt+shift+i"),
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
