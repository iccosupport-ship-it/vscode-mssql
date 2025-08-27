/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyboardEvent } from "react";
import {
    ResultSetSummary,
    DbCellValue,
    SendToClipboardRequest,
    CopySelectionRequest,
} from "../../../../../sharedInterfaces/queryResult";
import { selectEntireGrid, selectionToRange, tryCombineSelectionsForResults } from "../utils";
import { Keys } from "../../../../common/keys";
import { IDisposableDataProvider } from "../dataProvider";
import { QueryResultReactProvider } from "../../queryResultStateProvider";
import { GetPlatformRequest } from "../../../../../sharedInterfaces/webview";

/**
 * Implements the various additional navigation keybindings we want out of slickgrid
 */
export class CopyKeybind<T extends Slick.SlickData> implements Slick.Plugin<T> {
    private grid!: Slick.Grid<T>;
    private handler = new Slick.EventHandler();
    private uri: string;
    private resultSetSummary: ResultSetSummary;
    private platform: string | null = null;
    private platformInitialized = false;
    private lastCopyAttempt = 0;
    private copyInProgress = false;
    private documentEventListener: ((e: Event) => void) | null = null;
    private lastFocusTime = 0;

    constructor(
        uri: string,
        resultSetSummary: ResultSetSummary,
        private _qrContext: QueryResultReactProvider,
        private dataProvider: IDisposableDataProvider<T>,
    ) {
        this.uri = uri;
        this.resultSetSummary = resultSetSummary;
        void this.initializePlatform();
    }

    public init(grid: Slick.Grid<T>) {
        this.grid = grid;
        this.handler.subscribe(this.grid.onKeyDown, (e: Slick.DOMEvent) =>
            this.handleKeyDown(e as unknown as KeyboardEvent),
        );

        // Add global document listener as fallback for when grid loses focus during streaming
        this.documentEventListener = (e) =>
            this.handleDocumentKeyDown(e as unknown as KeyboardEvent);
        document.addEventListener("keydown", this.documentEventListener, { capture: true });

        // Track focus events to help with focus restoration
        const gridContainer = this.grid.getContainerNode();
        if (gridContainer) {
            gridContainer.addEventListener("focusin", () => {
                this.lastFocusTime = Date.now();
                this._qrContext.log("Copy keybind: Grid gained focus");
            });
            gridContainer.addEventListener("focusout", () => {
                this._qrContext.log("Copy keybind: Grid lost focus");
            });
        }
    }

    public destroy() {
        this.grid.onKeyDown.unsubscribe();

        // Remove document event listener
        if (this.documentEventListener) {
            document.removeEventListener("keydown", this.documentEventListener, { capture: true });
            this.documentEventListener = null;
        }
    }

    private async initializePlatform(): Promise<void> {
        try {
            this.platform = await this._qrContext.extensionRpc.sendRequest(GetPlatformRequest.type);
            this.platformInitialized = true;
            this._qrContext.log(`Copy keybind: Platform initialized as ${this.platform}`);
        } catch (error) {
            this._qrContext.log(`Copy keybind: Failed to initialize platform: ${error}`);
            // Fallback to non-darwin (Windows/Linux) behavior
            this.platform = "win32";
            this.platformInitialized = true;
        }
    }

    private async handleKeyDown(e: KeyboardEvent): Promise<void> {
        // Ensure platform is initialized before handling keydown
        if (!this.platformInitialized) {
            this._qrContext.log("Copy keybind: Platform not initialized, ignoring keystroke");
            return;
        }

        // Prevent rapid successive copy attempts during streaming
        const now = Date.now();
        if (this.copyInProgress) {
            this._qrContext.log(
                "Copy keybind: Copy operation already in progress, ignoring keystroke",
            );
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        if (now - this.lastCopyAttempt < 500) {
            // Debounce for 500ms
            this._qrContext.log(
                "Copy keybind: Copy attempt too soon after previous attempt, ignoring keystroke",
            );
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        let handled = false;

        try {
            if (this.platform === "darwin") {
                // Cmd + C on macOS
                if (e.metaKey && e.key === Keys.c) {
                    handled = true;
                    this._qrContext.log("Copy keybind: Cmd+C detected on macOS");
                    this.lastCopyAttempt = now;
                    this.copyInProgress = true;
                    await this.handleCopySelection(this.grid, this.uri, this.resultSetSummary);
                    this.copyInProgress = false;
                }
            } else {
                // Ctrl + C on Windows/Linux
                if (e.ctrlKey && e.key === Keys.c) {
                    handled = true;
                    this._qrContext.log("Copy keybind: Ctrl+C detected on Windows/Linux");
                    this.lastCopyAttempt = now;
                    this.copyInProgress = true;
                    await this.handleCopySelection(this.grid, this.uri, this.resultSetSummary);
                    this.copyInProgress = false;
                }
            }
        } catch (error) {
            this._qrContext.log(`Copy keybind: Error handling copy operation: ${error}`);
            this.copyInProgress = false; // Reset flag on error
            handled = true; // Still prevent default to avoid inconsistent behavior
        }

        if (handled) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    private async handleDocumentKeyDown(e: KeyboardEvent): Promise<void> {
        // Only handle if we're focused within the grid container or if grid has lost focus during streaming
        const gridContainer = this.grid.getContainerNode();
        if (!gridContainer) {
            return;
        }

        // Check if the target is within our grid container or if it's a generic element that might have stolen focus
        const target = e.target as Element;
        const isWithinGrid = gridContainer.contains(target);
        const isGenericElement = target.tagName === "BODY" || target.tagName === "HTML";

        // Also check if we recently had focus (within last 2 seconds) to catch streaming scenarios
        const recentlyHadFocus = Date.now() - this.lastFocusTime < 2000;

        // Only proceed if we're within the grid area, if focus was stolen by a generic element,
        // or if we recently had focus (streaming scenario)
        if (!isWithinGrid && !isGenericElement && !recentlyHadFocus) {
            return;
        }

        // Ensure platform is initialized before handling keydown
        if (!this.platformInitialized) {
            return;
        }

        // Prevent rapid successive copy attempts during streaming
        const now = Date.now();
        if (this.copyInProgress) {
            return;
        }

        if (now - this.lastCopyAttempt < 500) {
            // Debounce for 500ms
            return;
        }

        let shouldHandle = false;

        if (this.platform === "darwin") {
            // Cmd + C on macOS
            if (e.metaKey && e.key === Keys.c) {
                shouldHandle = true;
            }
        } else {
            // Ctrl + C on Windows/Linux
            if (e.ctrlKey && e.key === Keys.c) {
                shouldHandle = true;
            }
        }

        if (shouldHandle) {
            this._qrContext.log(
                "Copy keybind: Document-level Ctrl+C detected (grid focus fallback)",
            );
            e.preventDefault();
            e.stopPropagation();

            try {
                this.lastCopyAttempt = now;
                this.copyInProgress = true;
                await this.handleCopySelection(this.grid, this.uri, this.resultSetSummary);
                this.copyInProgress = false;
            } catch (error) {
                this._qrContext.log(
                    `Copy keybind: Error in document-level copy operation: ${error}`,
                );
                this.copyInProgress = false;
            }
        }
    }

    public async handleCopySelection(
        grid: Slick.Grid<T>,
        uri: string,
        resultSetSummary: ResultSetSummary,
    ): Promise<void> {
        // Show visual feedback that copy is in progress
        const originalTitle = document.title;
        document.title = "Copying...";

        try {
            this._qrContext.log("Copy keybind: Starting copy operation");

            const selectionModel = grid.getSelectionModel();
            if (!selectionModel) {
                this._qrContext.log("Copy keybind: No selection model available");
                document.title = originalTitle; // Restore title
                return;
            }

            let selectedRanges = selectionModel.getSelectedRanges();
            let selection = tryCombineSelectionsForResults(selectedRanges);

            // If no selection exists, create a selection for the entire grid
            if (!selection || selection.length === 0) {
                this._qrContext.log("Copy keybind: No selection found, selecting entire grid");
                selection = selectEntireGrid(grid);
            } else {
                this._qrContext.log(`Copy keybind: Found ${selection.length} selection ranges`);
            }

            if (this.dataProvider.isDataInMemory) {
                this._qrContext.log("Copy keybind: Using in-memory data provider");
                let range = selectionToRange(selection[0]);

                // Add retry logic for streaming scenarios
                let data: T[] = [];
                let retryCount = 0;
                const maxRetries = 3;

                while (retryCount < maxRetries) {
                    try {
                        data = await this.dataProvider.getRangeAsync(range.start, range.length);
                        if (data && data.length > 0) {
                            break; // Success, exit retry loop
                        }
                        retryCount++;
                        if (retryCount < maxRetries) {
                            this._qrContext.log(
                                `Copy keybind: Empty data received, retrying (${retryCount}/${maxRetries})`,
                            );
                            await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms before retry
                        }
                    } catch (error) {
                        retryCount++;
                        this._qrContext.log(
                            `Copy keybind: getRangeAsync failed (attempt ${retryCount}/${maxRetries}): ${error}`,
                        );
                        if (retryCount < maxRetries) {
                            await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms before retry
                        } else {
                            throw error; // Re-throw after max retries
                        }
                    }
                }

                if (!data || data.length === 0) {
                    this._qrContext.log(
                        "Copy keybind: No data available after retries, falling back to server-side copy",
                    );
                    // Fall back to server-side copy when in-memory data is not available
                    await this._qrContext.extensionRpc.sendRequest(CopySelectionRequest.type, {
                        uri: uri,
                        batchId: resultSetSummary.batchId,
                        resultId: resultSetSummary.id,
                        selection: selection,
                    });
                    this._qrContext.log(
                        "Copy keybind: Sent fallback copy selection request to server",
                    );
                    return;
                }

                const dataArray = data.map((map) => {
                    const maxKey = Math.max(...Array.from(Object.keys(map)).map(Number));
                    return Array.from(
                        { length: maxKey + 1 },
                        (_, index) =>
                            ({
                                rowId: index,
                                displayValue: map[index].displayValue || null,
                                isNull: map[index].isNull || false,
                            }) as DbCellValue,
                    );
                });
                await this._qrContext.extensionRpc.sendRequest(SendToClipboardRequest.type, {
                    uri: uri,
                    data: dataArray,
                    batchId: resultSetSummary.batchId,
                    resultId: resultSetSummary.id,
                    selection: selection,
                    headersFlag: false,
                });
                this._qrContext.log("Copy keybind: Sent in-memory data to clipboard");
            } else {
                this._qrContext.log("Copy keybind: Using server-side data provider");
                await this._qrContext.extensionRpc.sendRequest(CopySelectionRequest.type, {
                    uri: uri,
                    batchId: resultSetSummary.batchId,
                    resultId: resultSetSummary.id,
                    selection: selection,
                });
                this._qrContext.log("Copy keybind: Sent copy selection request to server");
            }

            // Restore title after successful copy
            document.title = originalTitle;
        } catch (error) {
            this._qrContext.log(`Copy keybind: Error in copy operation: ${error}`);
            // Restore title even on error
            document.title = originalTitle;
            throw error; // Re-throw so the caller can handle it
        }
    }
}
