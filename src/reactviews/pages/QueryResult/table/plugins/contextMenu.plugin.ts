/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    QueryResultContextMenuActions,
    CopyAsCsvRequest,
    CopyAsJsonRequest,
    CopyHeadersRequest,
    CopySelectionRequest,
    CopyWithHeadersRequest,
    DbCellValue,
    QueryResultReducers,
    QueryResultWebviewState,
    ResultSetSummary,
    SendToClipboardRequest,
} from "../../../../../sharedInterfaces/queryResult";
import { locConstants } from "../../../../common/locConstants";
import { VscodeWebviewContext } from "../../../../common/vscodeWebviewProvider";
import { QueryResultContextProps } from "../../queryResultStateProvider";
import { IDisposableDataProvider } from "../dataProvider";
import { HybridDataProvider } from "../hybridDataProvider";
import { selectEntireGrid, selectionToRange, tryCombineSelectionsForResults } from "../utils";
import "./contextMenu.css";

export interface ContextMenuPosition {
    x: number;
    y: number;
    row: number;
    cell: number;
}

export class ContextMenu<T extends Slick.SlickData> {
    private grid!: Slick.Grid<T>;
    private handler = new Slick.EventHandler();
    private activeContextMenu: JQuery<HTMLElement> | null = null;
    private onContextMenuCallback?: (position: ContextMenuPosition) => void;

    constructor(
        private uri: string,
        private resultSetSummary: ResultSetSummary,
        private queryResultContext: QueryResultContextProps,
        private webViewState: VscodeWebviewContext<QueryResultWebviewState, QueryResultReducers>,
        private dataProvider: IDisposableDataProvider<T>,
        onContextMenuCallback?: (position: ContextMenuPosition) => void,
    ) {
        this.uri = uri;
        this.resultSetSummary = resultSetSummary;
        this.webViewState = webViewState;
        this.onContextMenuCallback = onContextMenuCallback;
    }

    public init(grid: Slick.Grid<T>): void {
        this.grid = grid;
        this.handler.subscribe(this.grid.onContextMenu, (e: Event) => this.handleContextMenu(e));
        this.handler.subscribe(this.grid.onHeaderClick, (e: Event) => this.headerClickHandler(e));
    }

    public destroy() {
        this.handler.unsubscribeAll();
    }

    private headerClickHandler(e: Event): void {
        if (!(jQuery(e.target!) as any).closest("#contextMenu").length) {
            if (this.activeContextMenu) {
                this.activeContextMenu.hide();
            }
        }
    }

    private handleContextMenu(e: Event): void {
        e.preventDefault();
        let mouseEvent = e as MouseEvent;
        let cell = this.grid.getCellFromEvent(e);

        // If React callback is provided, use it instead of jQuery menu
        if (this.onContextMenuCallback) {
            this.onContextMenuCallback({
                x: mouseEvent.clientX,
                y: mouseEvent.clientY,
                row: cell.row,
                cell: cell.cell,
            });
            return;
        }

        // Fallback to old jQuery implementation if no React callback
        const $contextMenu = jQuery(
            `<ul id="contextMenu">` +
                `<li data-action="select-all" class="contextMenu">${locConstants.queryResult.selectAll}</li>` +
                `<li data-action="copy" class="contextMenu">${locConstants.queryResult.copy}</li>` +
                `<li data-action="copy-with-headers" class="contextMenu">${locConstants.queryResult.copyWithHeaders}</li>` +
                `<li data-action="copy-headers" class="contextMenu">${locConstants.queryResult.copyHeaders}</li>` +
                `<li data-action="copy-as-csv" class="contextMenu">Copy as CSV</li>` +
                `<li data-action="copy-as-json" class="contextMenu">Copy as JSON</li>` +
                `</ul>`,
        );
        // Remove any existing context menus to avoid duplication
        jQuery("#contextMenu").remove();

        // Append the menu to the body and set its position
        jQuery("body").append($contextMenu);

        $contextMenu
            .data("row", cell.row)
            .css("top", mouseEvent.pageY)
            .css("left", mouseEvent.pageX)
            .show();

        this.activeContextMenu = $contextMenu;
        jQuery("body").one("click", () => {
            $contextMenu.hide();
            this.activeContextMenu = null;
        });

        $contextMenu.on("click", "li", async (event) => {
            const action = jQuery(event.target).data("action");
            await this.handleMenuAction(action);
            $contextMenu.hide(); // Hide the menu after an action is clicked
            this.activeContextMenu = null;
        });
    }

    public async handleMenuAction(action: QueryResultContextMenuActions): Promise<void> {
        let selectedRanges = this.grid.getSelectionModel().getSelectedRanges();
        let selection = tryCombineSelectionsForResults(selectedRanges);

        // If no selection exists, create a selection for the entire grid
        if (!selection || selection.length === 0) {
            selection = selectEntireGrid(this.grid);
        }

        switch (action) {
            case QueryResultContextMenuActions.SelectAll:
                this.queryResultContext.log("Select All action triggered");
                const data = this.grid.getData() as HybridDataProvider<T>;
                let selectionModel = this.grid.getSelectionModel();
                selectionModel.setSelectedRanges([
                    new Slick.Range(0, 0, data.length - 1, this.grid.getColumns().length - 1),
                ]);
                break;
            case QueryResultContextMenuActions.Copy:
                this.queryResultContext.log("Copy action triggered");
                if (this.dataProvider.isDataInMemory) {
                    this.queryResultContext.log(
                        "Sorted/filtered grid detected, fetching data from data provider",
                    );
                    let range = selectionToRange(selection[0]);
                    let data = await this.dataProvider.getRangeAsync(range.start, range.length);
                    const dataArray = data.map((map) => {
                        const maxKey = Math.max(...Array.from(Object.keys(map)).map(Number)); // Get the maximum key
                        return Array.from(
                            { length: maxKey + 1 },
                            (_, index) =>
                                ({
                                    rowId: index,
                                    displayValue: map[index].displayValue || null,
                                }) as DbCellValue,
                        );
                    });
                    await this.webViewState.extensionRpc.sendRequest(SendToClipboardRequest.type, {
                        uri: this.uri,
                        data: dataArray,
                        batchId: this.resultSetSummary.batchId,
                        resultId: this.resultSetSummary.id,
                        selection: selection,
                        headersFlag: false,
                    });
                } else {
                    await this.webViewState.extensionRpc.sendRequest(CopySelectionRequest.type, {
                        uri: this.uri,
                        batchId: this.resultSetSummary.batchId,
                        resultId: this.resultSetSummary.id,
                        selection: selection,
                    });
                }

                break;
            case QueryResultContextMenuActions.CopyWithHeader:
                this.queryResultContext.log("Copy with headers action triggered");

                if (this.dataProvider.isDataInMemory) {
                    this.queryResultContext.log(
                        "Sorted/filtered grid detected, fetching data from data provider",
                    );

                    let range = selectionToRange(selection[0]);
                    let data = await this.dataProvider.getRangeAsync(range.start, range.length);
                    const dataArray = data.map((map) => {
                        const maxKey = Math.max(...Array.from(Object.keys(map)).map(Number)); // Get the maximum key
                        return Array.from(
                            { length: maxKey + 1 },
                            (_, index) =>
                                ({
                                    rowId: index,
                                    displayValue: map[index].displayValue || null,
                                }) as DbCellValue,
                        );
                    });
                    await this.webViewState.extensionRpc.sendRequest(SendToClipboardRequest.type, {
                        uri: this.uri,
                        data: dataArray,
                        batchId: this.resultSetSummary.batchId,
                        resultId: this.resultSetSummary.id,
                        selection: selection,
                        headersFlag: true,
                    });
                } else {
                    await this.webViewState.extensionRpc.sendRequest(CopyWithHeadersRequest.type, {
                        uri: this.uri,
                        batchId: this.resultSetSummary.batchId,
                        resultId: this.resultSetSummary.id,
                        selection: selection,
                    });
                }

                break;
            case QueryResultContextMenuActions.CopyHeaders:
                this.queryResultContext.log("Copy Headers action triggered");
                await this.webViewState.extensionRpc.sendRequest(CopyHeadersRequest.type, {
                    uri: this.uri,
                    batchId: this.resultSetSummary.batchId,
                    resultId: this.resultSetSummary.id,
                    selection: selection,
                });
                break;
            case QueryResultContextMenuActions.CopyAsCsv:
                this.queryResultContext.log("Copy as CSV action triggered");
                await this.webViewState.extensionRpc.sendRequest(CopyAsCsvRequest.type, {
                    uri: this.uri,
                    batchId: this.resultSetSummary.batchId,
                    resultId: this.resultSetSummary.id,
                    selection: selection,
                    includeHeaders: true, // Default to including headers for CSV
                });
                break;
            case QueryResultContextMenuActions.CopyAsJson:
                this.queryResultContext.log("Copy as JSON action triggered");
                await this.webViewState.extensionRpc.sendRequest(CopyAsJsonRequest.type, {
                    uri: this.uri,
                    batchId: this.resultSetSummary.batchId,
                    resultId: this.resultSetSummary.id,
                    selection: selection,
                    includeHeaders: true, // Default to including headers for JSON
                });
                break;
            default:
                console.warn("Unknown action:", action);
        }
    }
}
