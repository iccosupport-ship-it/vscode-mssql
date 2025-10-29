/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useQueryResultSelector } from "./queryResultSelector";
import * as qr from "../../../sharedInterfaces/queryResult";
import { makeStyles } from "@fluentui/react-components";
import { ACTIONBAR_WIDTH_PX, SCROLLBAR_PX, TABLE_ALIGN_PX } from "./table/table";
import { TextView } from "./textView";
import CommandBar from "./commandBar";
import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { getGridCount } from "./table/utils";
import ResultGrid, { ResultGridHandle } from "./resultGrid";
import { eventMatchesShortcut } from "../../common/keyboardUtils";
import { WebviewAction } from "../../../sharedInterfaces/webview";
import { QueryResultCommandsContext } from "./queryResultStateProvider";
import { useVscodeWebview2 } from "../../common/vscodeWebviewProvider2";

const useStyles = makeStyles({
    textViewContainer: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        fontWeight: "normal",
    },
    gridContainer: {
        width: "100%",
        height: "100%",
        fontFamily: "var(--vscode-editor-font-family)",
        flexDirection: "column",
    },
    queryResultContainer: {
        width: "100%",
        position: "relative",
        display: "flex",
        fontWeight: "normal",
    },
});

const MIN_GRID_HEIGHT = 273; // Minimum height for a grid

export const QueryResultsTab = () => {
    const context = useContext(QueryResultCommandsContext);
    if (!context) {
        return;
    }

    const classes = useStyles();
    const uri = useQueryResultSelector((state) => state.uri);
    const resultSetSummaries = useQueryResultSelector((state) => state.resultSetSummaries);
    const viewMode =
        useQueryResultSelector((state) => state.tabStates?.resultViewMode) ??
        qr.QueryResultViewMode.Grid;
    const fontSettings = useQueryResultSelector((state) => state.fontSettings);
    const tabStates = useQueryResultSelector((state) => state.tabStates);
    const { keyboardShortcuts } = useVscodeWebview2();

    const gridIndexByElementIdRef = useRef<Record<string, number>>({});
    const gridElementIdsRef = useRef<string[]>([]);
    const gridRefs = useRef<Array<ResultGridHandle | undefined>>([]);
    const gridParentRef = useRef<HTMLDivElement>(null);

    const rootRef = useRef<HTMLDivElement>(null);

    const [maximizedGridIndex, setMaximizedGridIndex] = useState<number | undefined>(undefined);

    const calculateGridHeight = (gridCount: number, availableHeight: number) => {
        if (gridCount > 1) {
            // Calculate the grid height, ensuring it's not smaller than the minimum height
            return Math.max(
                (availableHeight - gridCount * TABLE_ALIGN_PX) / gridCount,
                MIN_GRID_HEIGHT,
            );
        }
        // gridCount is 1
        return availableHeight - TABLE_ALIGN_PX;
    };

    const calculateGridWidth = (
        resultPaneParent: HTMLDivElement,
        gridCount: number,
        availableHeight: number,
    ) => {
        if (gridCount > 1) {
            let scrollbarAdjustment =
                gridCount * MIN_GRID_HEIGHT >= availableHeight ? SCROLLBAR_PX : 0;

            return resultPaneParent.clientWidth - ACTIONBAR_WIDTH_PX - scrollbarAdjustment;
        }
        // gridCount is 1
        return resultPaneParent.clientWidth - ACTIONBAR_WIDTH_PX;
    };

    const hideOtherGrids = useCallback((gridIndexToKeep: number) => {
        gridRefs.current.forEach((grid, index) => {
            if (!grid || index === gridIndexToKeep) {
                return;
            }
            grid.hideGrid();
        });
    }, []);

    const showOtherGrids = useCallback((gridIndexToKeep: number) => {
        gridRefs.current.forEach((grid, index) => {
            if (!grid || index === gridIndexToKeep) {
                return;
            }
            grid.showGrid();
        });
    }, []);

    const getGridIndexFromElement = useCallback((element: Element | null): number | undefined => {
        let current: Element | null = element;
        while (current) {
            if (current instanceof HTMLElement) {
                const mappedIndex = gridIndexByElementIdRef.current[current.id];
                if (typeof mappedIndex === "number") {
                    return mappedIndex;
                }
                current = current.parentElement;
            } else {
                break;
            }
        }
        return undefined;
    }, []);

    const resolveGridIndexForShortcut = useCallback((): number | undefined => {
        const activeIndex = getGridIndexFromElement(document.activeElement);
        if (activeIndex !== undefined && gridRefs.current[activeIndex]) {
            return activeIndex;
        }

        if (maximizedGridIndex !== undefined && gridRefs.current[maximizedGridIndex]) {
            return maximizedGridIndex;
        }

        const firstAvailableIndex = gridRefs.current.findIndex((grid) => !!grid);
        return firstAvailableIndex === -1 ? undefined : firstAvailableIndex;
    }, [getGridIndexFromElement, maximizedGridIndex]);

    const restoreResults = useCallback(
        (scrollToGridIndex?: number) => {
            if (!rootRef.current) {
                return;
            }

            const definedGridRefs = gridRefs.current.filter(
                (grid): grid is ResultGridHandle => !!grid,
            );

            if (definedGridRefs.length === 0) {
                return;
            }

            const height = calculateGridHeight(
                definedGridRefs.length,
                rootRef.current!.clientHeight,
            );
            const width = calculateGridWidth(
                rootRef.current!,
                definedGridRefs.length,
                rootRef.current!.clientHeight,
            );

            definedGridRefs.forEach((gridRef) => {
                gridRef.resizeGrid(width, height);
            });

            if (scrollToGridIndex !== undefined && resultSetSummaries) {
                setTimeout(() => {
                    let currentIndex = 0;
                    for (const batchIdStr in resultSetSummaries) {
                        const batchId = parseInt(batchIdStr);
                        for (const resultIdStr in resultSetSummaries[batchId]) {
                            const resultId = parseInt(resultIdStr);
                            if (currentIndex === scrollToGridIndex) {
                                const gridElement = document.getElementById(
                                    `grid-parent-${batchId}-${resultId}`,
                                );
                                if (gridElement) {
                                    gridElement.scrollIntoView({
                                        behavior: "instant",
                                        block: "start",
                                    });
                                }
                                return;
                            }
                            currentIndex++;
                        }
                    }
                }, 100);
            }
        },
        [resultSetSummaries],
    );

    const maximizeResults = useCallback((gridRef: ResultGridHandle) => {
        if (!rootRef.current) {
            return;
        }

        const height = rootRef.current!.clientHeight - TABLE_ALIGN_PX;
        const width = rootRef.current!.clientWidth - ACTIONBAR_WIDTH_PX;

        gridRef.resizeGrid(width, height);
    }, []);

    const navigateGrid = useCallback(
        (direction: 1 | -1) => {
            const total = getGridCount(resultSetSummaries);
            if (total <= 1) {
                return;
            }

            const currentIndex = resolveGridIndexForShortcut();
            let targetIndex: number;
            if (currentIndex === undefined) {
                targetIndex = direction > 0 ? 0 : total - 1;
            } else {
                targetIndex = (currentIndex + direction + total) % total;
            }

            if (maximizedGridIndex !== undefined) {
                showOtherGrids(maximizedGridIndex);
                restoreResults(targetIndex);
                setMaximizedGridIndex(undefined);
            }

            const targetId = gridElementIdsRef.current[targetIndex];
            if (targetId) {
                document.getElementById(targetId)?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });
            }

            gridRefs.current[targetIndex]?.focusGrid?.();
        },
        [
            getGridCount,
            resolveGridIndexForShortcut,
            maximizedGridIndex,
            showOtherGrids,
            restoreResults,
            setMaximizedGridIndex,
        ],
    );

    const toggleGridMaximize = useCallback(
        (gridIndex: number) => {
            if (getGridCount(resultSetSummaries) <= 1) {
                return;
            }

            const targetGrid = gridRefs.current[gridIndex];
            if (!targetGrid) {
                return;
            }

            if (maximizedGridIndex === gridIndex) {
                showOtherGrids(gridIndex);
                restoreResults(gridIndex);
                setMaximizedGridIndex(undefined);
                return;
            }

            if (maximizedGridIndex !== undefined && gridRefs.current[maximizedGridIndex]) {
                showOtherGrids(maximizedGridIndex);
                restoreResults(maximizedGridIndex);
            } else {
                restoreResults();
            }

            maximizeResults(targetGrid);
            hideOtherGrids(gridIndex);
            setMaximizedGridIndex(gridIndex);
        },
        [
            getGridCount,
            hideOtherGrids,
            maximizeResults,
            restoreResults,
            showOtherGrids,
            maximizedGridIndex,
        ],
    );

    // Resize grid when parent element resizes
    useEffect(() => {
        const gridCount = getGridCount(resultSetSummaries);
        if (gridCount === 0) {
            return; // Exit if there are no results/messages grids to render
        }

        const parentDiv = rootRef.current;
        if (!parentDiv) {
            return;
        }

        const observer = new ResizeObserver(() => {
            if (!gridRefs.current) {
                return;
            }

            const parentHeight = parentDiv.clientHeight;

            if (parentDiv.clientWidth) {
                const gridHeight = calculateGridHeight(gridCount, parentHeight);
                const gridWidth = calculateGridWidth(parentDiv, gridCount, parentHeight);
                if (gridCount > 1) {
                    gridRefs.current.forEach((gridRef) => {
                        gridRef?.resizeGrid(gridWidth, gridHeight);
                    });
                } else if (gridCount === 1) {
                    gridRefs.current[0]?.resizeGrid(gridWidth, gridHeight);
                }
            }
        });

        observer.observe(parentDiv);

        return () => {
            observer.disconnect();
        };
    }, [getGridCount, tabStates?.resultPaneTab]);

    if (viewMode === qr.QueryResultViewMode.Text) {
        return (
            <div className={classes.textViewContainer}>
                <div style={{ flex: 1, display: "flex", flexDirection: "row" }}>
                    <div
                        style={{
                            width: `calc(100% - ${ACTIONBAR_WIDTH_PX}px)`,
                            height: "100%",
                        }}>
                        <TextView />
                    </div>
                    <CommandBar uri={uri} viewMode={viewMode} />
                </div>
            </div>
        );
    }

    const renderResultSet = (batchId: number, resultId: number, gridIndex: number) => {
        const divId = `grid-parent-${batchId}-${resultId}`;
        const gridId = `resultGrid-${batchId}-${resultId}`;

        gridIndexByElementIdRef.current[divId] = gridIndex;
        gridElementIdsRef.current[gridIndex] = divId;

        return (
            <div
                id={divId}
                className={classes.queryResultContainer}
                ref={gridParentRef}
                style={{
                    height: `${rootRef?.current?.clientHeight}px`,
                    fontFamily: fontSettings.fontFamily
                        ? fontSettings.fontFamily
                        : "var(--vscode-font-family)",
                    fontSize: `${fontSettings.fontSize ?? 12}px`,
                }}>
                {/* Render Grid View */}
                {viewMode === qr.QueryResultViewMode.Grid && (
                    <ResultGrid
                        ref={(gridRef) => {
                            gridRefs.current[gridIndex] = gridRef ?? undefined;
                        }}
                        resultSetSummary={resultSetSummaries[batchId][resultId]}
                        gridParentRef={gridParentRef}
                        gridId={gridId}
                    />
                )}

                {viewMode === qr.QueryResultViewMode.Grid && (
                    <CommandBar
                        uri={uri}
                        resultSetSummary={resultSetSummaries[batchId][resultId]}
                        viewMode={viewMode}
                        onToggleMaximize={() => toggleGridMaximize(gridIndex)}
                        isMaximized={maximizedGridIndex === gridIndex}
                    />
                )}
            </div>
        );
    };

    useEffect(() => {
        if (maximizedGridIndex === undefined) {
            return;
        }

        const shouldReset =
            tabStates?.resultPaneTab !== qr.QueryResultPaneTabs.Results ||
            viewMode !== qr.QueryResultViewMode.Grid ||
            getGridCount(resultSetSummaries) <= 1 ||
            !gridRefs.current[maximizedGridIndex];

        if (!shouldReset) {
            return;
        }

        showOtherGrids(maximizedGridIndex);
        restoreResults(maximizedGridIndex);
        setMaximizedGridIndex(undefined);
    }, [getGridCount, tabStates?.resultPaneTab]);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const isResultsTab = tabStates?.resultPaneTab === qr.QueryResultPaneTabs.Results;
            const gridCount = getGridCount(resultSetSummaries);
            let handled = false;
            if (
                eventMatchesShortcut(
                    event,
                    keyboardShortcuts[WebviewAction.QueryResultSwitchToTextView]?.keyCombination,
                )
            ) {
                if (isResultsTab) {
                    const newMode =
                        viewMode === qr.QueryResultViewMode.Grid
                            ? qr.QueryResultViewMode.Text
                            : qr.QueryResultViewMode.Grid;
                    context.setResultViewMode(newMode);
                    handled = true;
                }
            } else if (
                eventMatchesShortcut(
                    event,
                    keyboardShortcuts[WebviewAction.QueryResultMaximizeGrid]?.keyCombination,
                )
            ) {
                if (isResultsTab && viewMode === qr.QueryResultViewMode.Grid && gridCount > 1) {
                    const targetIndex = resolveGridIndexForShortcut();
                    if (targetIndex !== undefined) {
                        toggleGridMaximize(targetIndex);
                        handled = true;
                    }
                }
            } else if (
                eventMatchesShortcut(
                    event,
                    keyboardShortcuts[WebviewAction.QueryResultPrevGrid]?.keyCombination,
                )
            ) {
                if (isResultsTab && viewMode === qr.QueryResultViewMode.Grid && gridCount > 0) {
                    navigateGrid(-1);
                    handled = true;
                }
            } else if (
                eventMatchesShortcut(
                    event,
                    keyboardShortcuts[WebviewAction.QueryResultNextGrid]?.keyCombination,
                )
            ) {
                if (isResultsTab && viewMode === qr.QueryResultViewMode.Grid && gridCount > 0) {
                    navigateGrid(1);
                    handled = true;
                }
            }
            if (handled) {
                event.preventDefault();
                event.stopPropagation();
            }
        };

        document.addEventListener("keydown", handler, true);
        return () => {
            document.removeEventListener("keydown", handler, true);
        };
    }, [
        tabStates?.resultPaneTab,
        getGridCount,
        resolveGridIndexForShortcut,
        toggleGridMaximize,
        navigateGrid,
        context,
        resultSetSummaries,
    ]);

    const results = [];
    let count = 0;
    for (const batchIdStr in resultSetSummaries ?? {}) {
        const batchId = parseInt(batchIdStr);
        for (const resultIdStr in resultSetSummaries[batchId] ?? {}) {
            const resultId = parseInt(resultIdStr);
            results.push(
                <React.Fragment key={`result-${batchId}-${resultId}`}>
                    {renderResultSet(batchId, resultId, count)}
                </React.Fragment>,
            );
            count++;
        }
    }
    return (
        <div className={classes.gridContainer} ref={rootRef}>
            {results}
        </div>
    );
};
