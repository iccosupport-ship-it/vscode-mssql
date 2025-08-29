/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    CopyAsCsvRequest,
    CopyAsJsonRequest,
    CopyHeadersRequest,
    CopySelectionRequest,
    CopyWithHeadersRequest,
    DbCellValue,
    ResultSetSummary,
    SendToClipboardRequest,
} from "../../../../../sharedInterfaces/queryResult";
import { locConstants } from "../../../../common/locConstants";
import { QueryResultReactProvider } from "../../queryResultStateProvider";
import { IDisposableDataProvider } from "../dataProvider";
import { HybridDataProvider } from "../hybridDataProvider";
import { selectEntireGrid, selectionToRange, tryCombineSelectionsForResults } from "../utils";
import {
    showContextMenuOverlay,
    hideContextMenuOverlay,
    ContextMenuItem,
} from "../../../../common/contextMenuBus";

export class ContextMenu<T extends Slick.SlickData> {
    private grid!: Slick.Grid<T>;
    private handler = new Slick.EventHandler();
    // No separate root; we trigger overlay within parent React tree via bus

    constructor(
        private uri: string,
        private resultSetSummary: ResultSetSummary,
        private queryResultContext: QueryResultReactProvider,
        private dataProvider: IDisposableDataProvider<T>,
    ) {
        this.uri = uri;
        this.resultSetSummary = resultSetSummary;
    }

    public init(grid: Slick.Grid<T>): void {
        this.grid = grid;
        this.handler.subscribe(this.grid.onContextMenu, (e: Event) => this.handleContextMenu(e));
        this.handler.subscribe(this.grid.onHeaderClick, (e: Event) => this.headerClickHandler(e));
    }

    public destroy() {
        this.handler.unsubscribeAll();
    }

    private headerClickHandler(_e: Event): void {
        hideContextMenuOverlay();
    }

    private handleContextMenu(e: Event): void {
        e.preventDefault();
        const mouseEvent = e as MouseEvent;

        // Build menu items
        const items: ContextMenuItem[] = [
            { id: "select-all", label: locConstants.queryResult.selectAll },
            { id: "copy", label: locConstants.queryResult.copy },
            { id: "copy-with-headers", label: locConstants.queryResult.copyWithHeaders },
            { id: "copy-headers", label: locConstants.queryResult.copyHeaders },
            { id: "divider-1", label: "", kind: "divider" },
            { id: "copy-as-csv", label: "Copy as CSV" },
            { id: "copy-as-json", label: "Copy as JSON" },
        ];

        // Ensure we compute cell to keep parity (selection may depend on current cell later)
        this.grid.getCellFromEvent(e);

        // Show Fluent context menu anchored at mouse coordinates (viewport-relative),
        // integrated into the parent React app via overlay provider
        showContextMenuOverlay({
            x: mouseEvent.clientX,
            y: mouseEvent.clientY,
            items,
            onAction: async (actionId: string) => {
                await this.handleMenuAction(actionId);
            },
        });
    }

    private async handleMenuAction(action: string): Promise<void> {
        let selectedRanges = this.grid.getSelectionModel().getSelectedRanges();
        let selection = tryCombineSelectionsForResults(selectedRanges);

        // If no selection exists, create a selection for the entire grid
        if (!selection || selection.length === 0) {
            selection = selectEntireGrid(this.grid);
        }

        switch (action) {
            case "select-all":
                this.queryResultContext.log("Select All action triggered");
                const data = this.grid.getData() as HybridDataProvider<T>;
                let selectionModel = this.grid.getSelectionModel();
                selectionModel.setSelectedRanges([
                    new Slick.Range(0, 0, data.length - 1, this.grid.getColumns().length - 1),
                ]);
                break;
            case "copy":
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
                    await this.queryResultContext.extensionRpc.sendRequest(
                        SendToClipboardRequest.type,
                        {
                            uri: this.uri,
                            data: dataArray,
                            batchId: this.resultSetSummary.batchId,
                            resultId: this.resultSetSummary.id,
                            selection: selection,
                            headersFlag: false,
                        },
                    );
                } else {
                    await this.queryResultContext.extensionRpc.sendRequest(
                        CopySelectionRequest.type,
                        {
                            uri: this.uri,
                            batchId: this.resultSetSummary.batchId,
                            resultId: this.resultSetSummary.id,
                            selection: selection,
                        },
                    );
                }

                break;
            case "copy-with-headers":
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
                    await this.queryResultContext.extensionRpc.sendRequest(
                        SendToClipboardRequest.type,
                        {
                            uri: this.uri,
                            data: dataArray,
                            batchId: this.resultSetSummary.batchId,
                            resultId: this.resultSetSummary.id,
                            selection: selection,
                            headersFlag: true,
                        },
                    );
                } else {
                    await this.queryResultContext.extensionRpc.sendRequest(
                        CopyWithHeadersRequest.type,
                        {
                            uri: this.uri,
                            batchId: this.resultSetSummary.batchId,
                            resultId: this.resultSetSummary.id,
                            selection: selection,
                        },
                    );
                }

                break;
            case "copy-headers":
                this.queryResultContext.log("Copy Headers action triggered");
                await this.queryResultContext.extensionRpc.sendRequest(CopyHeadersRequest.type, {
                    uri: this.uri,
                    batchId: this.resultSetSummary.batchId,
                    resultId: this.resultSetSummary.id,
                    selection: selection,
                });
                break;
            case "copy-as-csv":
                this.queryResultContext.log("Copy as CSV action triggered");
                await this.queryResultContext.extensionRpc.sendRequest(CopyAsCsvRequest.type, {
                    uri: this.uri,
                    batchId: this.resultSetSummary.batchId,
                    resultId: this.resultSetSummary.id,
                    selection: selection,
                    includeHeaders: true, // Default to including headers for CSV
                });
                break;
            case "copy-as-json":
                this.queryResultContext.log("Copy as JSON action triggered");
                await this.queryResultContext.extensionRpc.sendRequest(CopyAsJsonRequest.type, {
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
