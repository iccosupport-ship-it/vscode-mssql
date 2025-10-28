/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    Button,
    Link,
    Tab,
    TabList,
    TableColumnDefinition,
    TableColumnSizingOptions,
    Title3,
    createTableColumn,
    makeStyles,
    Text,
    Spinner,
} from "@fluentui/react-components";
import {
    DataGridBody,
    DataGrid,
    DataGridRow,
    DataGridCell,
    RowRenderer,
} from "@fluentui-contrib/react-data-grid-react-window";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DatabaseSearch24Regular, ErrorCircle24Regular, OpenRegular } from "@fluentui/react-icons";
import * as qr from "../../../sharedInterfaces/queryResult";
import ResultGrid, { ResultGridHandle } from "./resultGrid";
import CommandBar from "./commandBar";
import { TextView } from "./textView";
import { locConstants } from "../../common/locConstants";
import { ACTIONBAR_WIDTH_PX, SCROLLBAR_PX, TABLE_ALIGN_PX } from "./table/table";
import { ExecutionPlanPage } from "../ExecutionPlan/executionPlanPage";
import { ExecutionPlanStateProvider } from "../ExecutionPlan/executionPlanStateProvider";
import { hasResultsOrMessages, splitMessages } from "./queryResultUtils";
import { QueryResultCommandsContext } from "./queryResultStateProvider";
import { useQueryResultSelector } from "./queryResultSelector";
import { ExecuteCommandRequest, WebviewAction } from "../../../sharedInterfaces/webview";
import { ExecutionPlanGraph } from "../../../sharedInterfaces/executionPlan";
import { SLICKGRID_ROW_ID_PROP } from "./table/utils";
import { eventMatchesShortcut } from "../../common/keyboardUtils";
import { useVscodeWebview2 } from "../../common/vscodeWebviewProvider2";

const useStyles = makeStyles({
    root: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
    },
    ribbon: {
        width: "100%",
        display: "flex",
        flexDirection: "row",
        "> *": {
            marginRight: "10px",
        },
    },
    queryResultPaneTabs: {
        flex: 1,
    },
    tabContent: {
        flex: 1,
        width: "100%",
        height: "100%",
        overflow: "auto",
    },
    queryResultContainer: {
        width: "100%",
        position: "relative",
        display: "flex",
        fontWeight: "normal",
    },
    textViewContainer: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        fontWeight: "normal",
    },
    queryResultPaneOpenButton: {
        position: "absolute",
        top: "0px",
        right: "0px",
    },
    messagesContainer: {
        width: "100%",
        height: "100%",
        fontFamily: "var(--vscode-editor-font-family)",
        flexDirection: "column",
        "> *": {
            marginBottom: "10px",
        },
    },
    messagesLink: {
        fontSize: "var(--vscode-editor-font-size)",
        fontFamily: "var(--vscode-editor-font-family)",
    },
    messagesRows: {
        lineHeight: "18px",
        fontSize: "var(--vscode-editor-font-size)",
        flexDirection: "row",
        borderBottom: "none",
    },
    noResultMessage: {
        fontSize: "14px",
        margin: "10px 0 0 10px",
    },
    hidePanelLink: {
        fontSize: "14px",
        margin: "10px 0 0 10px",
        cursor: "pointer",
    },
    noResultsContainer: {
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        overflowY: "auto",
        overflowX: "hidden",
        boxSizing: "border-box",
        padding: "20px",
    },
    noResultsScrollablePane: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
        minHeight: "150px",
    },
    noResultsIcon: {
        width: "56px",
        height: "56px",
        display: "grid",
        placeItems: "center",
        borderRadius: "14px",
        // Use VS Code theme info color for background accent
        // color-mix provides theme-aware translucent gradient
        background: "linear-gradient(135deg, rgba(0,120,212,.16), rgba(0,120,212,.06))",
    },
    resultErrorIcon: {
        width: "56px",
        height: "56px",
        display: "grid",
        placeItems: "center",
        borderRadius: "14px",
        // Use VS Code theme error color for background accent
        background: "linear-gradient(135deg, rgba(255,0,0,.16), rgba(255,0,0,.06))",
    },
});

const MIN_GRID_HEIGHT = 273; // Minimum height for a grid

function getAvailableHeight(resultPaneParent: HTMLDivElement, ribbonRef: HTMLDivElement) {
    return resultPaneParent.clientHeight - ribbonRef.clientHeight;
}

export const QueryResultPane = () => {
    const classes = useStyles();
    const context = useContext(QueryResultCommandsContext);

    if (!context) {
        return;
    }

    // Use selectors to get specific state pieces
    const resultSetSummaries = useQueryResultSelector<
        Record<number, Record<number, qr.ResultSetSummary>>
    >((s) => s.resultSetSummaries);
    const initilizationError = useQueryResultSelector<string | undefined>(
        (s) => s.initializationError,
    );
    const messages = useQueryResultSelector<qr.IMessage[]>((s) => s.messages);
    const uri = useQueryResultSelector<string | undefined>((s) => s.uri);
    const fontSettings = useQueryResultSelector<qr.FontSettings>((s) => s.fontSettings);
    const tabStates = useQueryResultSelector<qr.QueryResultTabStates | undefined>(
        (s) => s.tabStates,
    );
    const isExecutionPlan = useQueryResultSelector<boolean | undefined>((s) => s.isExecutionPlan);
    const executionPlanGraphs = useQueryResultSelector<ExecutionPlanGraph[] | undefined>(
        (s) => s.executionPlanState?.executionPlanGraphs,
    );
    const { keyboardShortcuts } = useVscodeWebview2();
    const isProgrammaticScroll = useRef(true);
    isProgrammaticScroll.current = true;

    const resultPaneParentRef = useRef<HTMLDivElement>(null);
    const ribbonRef = useRef<HTMLDivElement>(null);
    const gridParentRef = useRef<HTMLDivElement>(null);
    const scrollablePanelRef = useRef<HTMLDivElement>(null);
    const [messageGridHeight, setMessageGridHeight] = useState(0);
    const gridRefs = useRef<Array<ResultGridHandle | undefined>>([]);
    const [maximizedGridIndex, setMaximizedGridIndex] = useState<number | undefined>(undefined);
    const gridIndexByElementIdRef = useRef<Record<string, number>>({});
    const gridElementIdsRef = useRef<string[]>([]);

    const getGridCount = useCallback(() => {
        let count = 0;
        const batchIds = Object.keys(resultSetSummaries ?? {});
        for (const batchId of batchIds) {
            const summary = resultSetSummaries[parseInt(batchId)];
            if (summary) {
                count += Object.keys(summary).length;
            }
        }
        return count;
    }, [resultSetSummaries]);

    // Resize grid when parent element resizes
    useEffect(() => {
        const gridCount = getGridCount();
        if (gridCount === 0 && messages?.length === 0) {
            return; // Exit if there are no results/messages grids to render
        }

        const resultPaneParent = resultPaneParentRef.current;
        if (!resultPaneParent) {
            return;
        }
        const observer = new ResizeObserver(() => {
            if (!gridRefs.current || !ribbonRef.current) {
                return;
            }

            const availableHeight = getAvailableHeight(resultPaneParent, ribbonRef.current);
            if (tabStates?.resultPaneTab === qr.QueryResultPaneTabs.Messages) {
                setMessageGridHeight(availableHeight);
            }
            if (resultPaneParent.clientWidth && availableHeight) {
                const gridHeight = calculateGridHeight(gridCount, availableHeight);
                const gridWidth = calculateGridWidth(resultPaneParent, gridCount, availableHeight);
                if (gridCount > 1) {
                    gridRefs.current.forEach((gridRef) => {
                        gridRef?.resizeGrid(gridWidth, gridHeight);
                    });
                } else if (gridCount === 1) {
                    gridRefs.current[0]?.resizeGrid(gridWidth, gridHeight);
                }
            }
        });

        observer.observe(resultPaneParent);

        return () => {
            observer.disconnect();
        };
    }, [getGridCount, messages, tabStates?.resultPaneTab]);

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

    const linkHandler = (fileContent: string, fileType: string) => {
        if (context) {
            context.openFileThroughLink(fileContent, fileType);
        }
    };

    //#region Result Display (Grid or Text)
    const getCurrentViewMode = useCallback((): qr.QueryResultViewMode => {
        return tabStates?.resultViewMode ?? qr.QueryResultViewMode.Grid;
    }, [tabStates?.resultViewMode]);

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

    const maximizeResults = useCallback((gridRef: ResultGridHandle) => {
        if (!resultPaneParentRef.current || !ribbonRef.current) {
            return;
        }

        const height =
            getAvailableHeight(resultPaneParentRef.current, ribbonRef.current) - TABLE_ALIGN_PX;
        const width = resultPaneParentRef.current.clientWidth - ACTIONBAR_WIDTH_PX;

        gridRef.resizeGrid(width, height);
    }, []);

    const restoreResults = useCallback(
        (scrollToGridIndex?: number) => {
            if (!resultPaneParentRef.current || !ribbonRef.current) {
                return;
            }

            const availableHeight = getAvailableHeight(
                resultPaneParentRef.current,
                ribbonRef.current,
            );
            const definedGridRefs = gridRefs.current.filter(
                (grid): grid is ResultGridHandle => !!grid,
            );

            if (definedGridRefs.length === 0) {
                return;
            }

            const height = calculateGridHeight(definedGridRefs.length, availableHeight);
            const width = calculateGridWidth(
                resultPaneParentRef.current,
                definedGridRefs.length,
                availableHeight,
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

    const toggleGridMaximize = useCallback(
        (gridIndex: number) => {
            if (getGridCount() <= 1) {
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

    const navigateGrid = useCallback(
        (direction: 1 | -1) => {
            const total = getGridCount();
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

    const matchesShortcut = (event: KeyboardEvent, shortcut: ShortcutInfo) =>
        hasShortcut(shortcut) && eventMatchesShortcut(event, shortcut.matcher);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const isResultsTab = tabStates?.resultPaneTab === qr.QueryResultPaneTabs.Results;
            const viewMode = getCurrentViewMode();
            const gridCount = getGridCount();
            let handled = false;

            if (matchesShortcut(event, paneShortcuts.switchToResultsTab)) {
                if (Object.keys(resultSetSummaries ?? {}).length > 0) {
                    context.setResultTab(qr.QueryResultPaneTabs.Results);
                    handled = true;
                }
            } else if (matchesShortcut(event, paneShortcuts.switchToMessagesTab)) {
                context.setResultTab(qr.QueryResultPaneTabs.Messages);
                handled = true;
            } else if (matchesShortcut(event, paneShortcuts.switchToTextView)) {
                if (isResultsTab) {
                    const newMode =
                        viewMode === qr.QueryResultViewMode.Grid
                            ? qr.QueryResultViewMode.Text
                            : qr.QueryResultViewMode.Grid;
                    context.setResultViewMode(newMode);
                    handled = true;
                }
            } else if (matchesShortcut(event, paneShortcuts.maximize)) {
                if (isResultsTab && viewMode === qr.QueryResultViewMode.Grid && gridCount > 1) {
                    const targetIndex = resolveGridIndexForShortcut();
                    if (targetIndex !== undefined) {
                        toggleGridMaximize(targetIndex);
                        handled = true;
                    }
                }
            } else if (matchesShortcut(event, paneShortcuts.prevGrid)) {
                if (isResultsTab && viewMode === qr.QueryResultViewMode.Grid && gridCount > 0) {
                    navigateGrid(-1);
                    handled = true;
                }
            } else if (matchesShortcut(event, paneShortcuts.nextGrid)) {
                if (isResultsTab && viewMode === qr.QueryResultViewMode.Grid && gridCount > 0) {
                    navigateGrid(1);
                    handled = true;
                }
            } else if (matchesShortcut(event, paneShortcuts.changeColumnWidth)) {
                if (isResultsTab && viewMode === qr.QueryResultViewMode.Grid && gridCount > 0) {
                    const targetIndex = resolveGridIndexForShortcut() ?? 0;
                    const gridHandle = gridRefs.current[targetIndex];
                    if (gridHandle) {
                        gridHandle.focusGrid?.();
                        gridHandle.autoSizeActiveColumn?.();
                        handled = true;
                    }
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
        paneShortcuts,
        tabStates?.resultPaneTab,
        getCurrentViewMode,
        getGridCount,
        resolveGridIndexForShortcut,
        toggleGridMaximize,
        navigateGrid,
        context,
        resultSetSummaries,
    ]);

    useEffect(() => {
        if (maximizedGridIndex === undefined) {
            return;
        }

        const shouldReset =
            tabStates?.resultPaneTab !== qr.QueryResultPaneTabs.Results ||
            getCurrentViewMode() !== qr.QueryResultViewMode.Grid ||
            getGridCount() <= 1 ||
            !gridRefs.current[maximizedGridIndex];

        if (!shouldReset) {
            return;
        }

        showOtherGrids(maximizedGridIndex);
        restoreResults(maximizedGridIndex);
        setMaximizedGridIndex(undefined);
    }, [
        getCurrentViewMode,
        getGridCount,
        maximizedGridIndex,
        restoreResults,
        showOtherGrids,
        tabStates?.resultPaneTab,
    ]);

    const renderResultSet = (
        batchId: number,
        resultId: number,
        gridIndex: number,
        totalGridCount: number,
    ) => {
        const divId = `grid-parent-${batchId}-${resultId}`;
        const gridId = `resultGrid-${batchId}-${resultId}`;
        const viewMode = getCurrentViewMode();

        gridIndexByElementIdRef.current[divId] = gridIndex;
        gridElementIdsRef.current[gridIndex] = divId;

        return (
            <div
                id={divId}
                className={classes.queryResultContainer}
                ref={gridParentRef}
                style={{
                    height:
                        resultPaneParentRef.current && ribbonRef.current
                            ? `${calculateGridHeight(
                                  totalGridCount,
                                  getAvailableHeight(
                                      resultPaneParentRef.current!,
                                      ribbonRef.current!,
                                  ),
                              )}px`
                            : "",
                    fontFamily: fontSettings.fontFamily
                        ? fontSettings.fontFamily
                        : "var(--vscode-font-family)",
                    fontSize: `${fontSettings.fontSize ?? 12}px`,
                }}>
                {/* Render Grid View */}
                {viewMode === qr.QueryResultViewMode.Grid && (
                    <ResultGrid
                        loadFunc={async (offset: number, count: number): Promise<any[]> => {
                            const response = await context.extensionRpc.sendRequest(
                                qr.GetRowsRequest.type,
                                {
                                    uri: uri!,
                                    batchId: batchId,
                                    resultId: resultId,
                                    rowStart: offset,
                                    numberOfRows: count,
                                },
                            );

                            if (!response) {
                                return [];
                            }
                            let r = response as qr.ResultSetSubset;
                            var columnLength =
                                resultSetSummaries[batchId][resultId]?.columnInfo?.length;
                            return r.rows.map((r, rowOffset) => {
                                let dataWithSchema: {
                                    [key: string]: any;
                                } = {};
                                // skip the first column since its a number column
                                for (let i = 1; columnLength && i < columnLength + 1; i++) {
                                    const cell = r[i - 1];
                                    const displayValue = cell.isNull
                                        ? "NULL"
                                        : (cell.displayValue ?? "");
                                    const ariaLabel = displayValue;
                                    dataWithSchema[(i - 1).toString()] = {
                                        displayValue: displayValue,
                                        ariaLabel: ariaLabel,
                                        isNull: cell.isNull,
                                        invariantCultureDisplayValue: displayValue,
                                    };
                                    dataWithSchema[SLICKGRID_ROW_ID_PROP] = offset + rowOffset;
                                }
                                return dataWithSchema;
                            });
                        }}
                        ref={(gridRef) => {
                            gridRefs.current[gridIndex] = gridRef ?? undefined;
                        }}
                        resultSetSummary={resultSetSummaries[batchId][resultId]}
                        gridParentRef={gridParentRef}
                        uri={uri}
                        linkHandler={linkHandler}
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
                        maximizeShortcut={paneShortcuts.maximize.display}
                        toggleViewShortcut={paneShortcuts.switchToTextView.display}
                        saveShortcuts={{
                            csv: commandShortcutDisplays.saveCsv,
                            json: commandShortcutDisplays.saveJson,
                            excel: commandShortcutDisplays.saveExcel,
                            insert: commandShortcutDisplays.saveInsert,
                        }}
                    />
                )}
            </div>
        );
    };

    const renderResultPanel = () => {
        const viewMode = getCurrentViewMode();
        gridIndexByElementIdRef.current = {};
        gridElementIdsRef.current = [];

        // For text view, render a single TextView with all result sets and one CommandBar
        if (viewMode === qr.QueryResultViewMode.Text) {
            return (
                <div className={classes.textViewContainer}>
                    <div style={{ flex: 1, display: "flex", flexDirection: "row" }}>
                        <div
                            style={{
                                width: `calc(100% - ${ACTIONBAR_WIDTH_PX}px)`,
                                height: "100%",
                            }}>
                            <TextView
                                uri={uri}
                                resultSetSummaries={resultSetSummaries}
                                fontSettings={fontSettings}
                            />
                        </div>
                        <CommandBar
                            uri={uri}
                            viewMode={viewMode}
                            maximizeShortcut={paneShortcuts.maximize.display}
                            toggleViewShortcut={paneShortcuts.switchToTextView.display}
                            saveShortcuts={{
                                csv: commandShortcutDisplays.saveCsv,
                                json: commandShortcutDisplays.saveJson,
                                excel: commandShortcutDisplays.saveExcel,
                                insert: commandShortcutDisplays.saveInsert,
                            }}
                        />
                    </div>
                </div>
            );
        }

        // Calculate total grid count
        let totalGridCount = getGridCount();

        const results = [];
        let count = 0;
        for (const batchIdStr in resultSetSummaries ?? {}) {
            const batchId = parseInt(batchIdStr);
            for (const resultIdStr in resultSetSummaries[batchId] ?? {}) {
                const resultId = parseInt(resultIdStr);
                results.push(
                    <React.Fragment key={`result-${batchId}-${resultId}`}>
                        {renderResultSet(batchId, resultId, count, totalGridCount)}
                    </React.Fragment>,
                );
                count++;
            }
        }
        return results;
    };
    //#endregion

    //#region Message Grid
    const columnsDef: TableColumnDefinition<qr.IMessage>[] = [
        createTableColumn({
            columnId: "time",
            renderHeaderCell: () => <>{locConstants.queryResult.timestamp}</>,
            renderCell: (item) => (
                <div>
                    <DataGridCell focusMode="group" style={{ minHeight: "18px", width: "100px" }}>
                        {item.batchId === undefined ? item.time : null}
                    </DataGridCell>
                </div>
            ),
        }),
        createTableColumn({
            columnId: "message",
            renderHeaderCell: () => <>{locConstants.queryResult.message}</>,
            renderCell: (item) => {
                if (item.link?.text && item.selection) {
                    return (
                        <DataGridCell focusMode="group" style={{ minHeight: "18px" }}>
                            <div style={{ whiteSpace: "pre" }}>
                                {item.message}{" "}
                                <Link
                                    className={classes.messagesLink}
                                    onClick={async () => {
                                        await context.extensionRpc.sendRequest(
                                            qr.SetEditorSelectionRequest.type,
                                            {
                                                uri: item.link?.uri,
                                                selectionData: item.selection,
                                            },
                                        );
                                    }}
                                    inline>
                                    {item?.link?.text}
                                </Link>
                            </div>
                        </DataGridCell>
                    );
                } else {
                    return (
                        <DataGridCell focusMode="group" style={{ minHeight: "18px" }}>
                            <div
                                style={{
                                    whiteSpace: "pre",
                                    color: item.isError
                                        ? "var(--vscode-errorForeground)"
                                        : undefined,
                                }}>
                                {item.message}
                            </div>
                        </DataGridCell>
                    );
                }
            },
        }),
    ];
    const renderRow: RowRenderer<qr.IMessage> = ({ item, rowId }, style) => {
        return (
            <DataGridRow<qr.IMessage>
                key={rowId}
                className={classes.messagesRows}
                style={style}
                aria-label={locConstants.queryResult.message}
                role={locConstants.queryResult.message}
                aria-roledescription={locConstants.queryResult.message}>
                {({ renderCell }) => <>{renderCell(item)}</>}
            </DataGridRow>
        );
    };

    const [columns] = useState<TableColumnDefinition<qr.IMessage>[]>(columnsDef);
    const items: qr.IMessage[] = splitMessages(messages);

    const sizingOptions: TableColumnSizingOptions = {
        time: {
            minWidth: 100,
            idealWidth: 100,
            defaultWidth: 100,
        },
        message: {
            minWidth: 500,
            idealWidth: 500,
            defaultWidth: 500,
        },
    };

    const [columnSizingOption] = useState<TableColumnSizingOptions>(sizingOptions);

    const renderMessageGrid = () => {
        return (
            <DataGrid
                items={items}
                columns={columns}
                focusMode="cell"
                resizableColumns={true}
                columnSizingOptions={columnSizingOption}
                role={locConstants.queryResult.messages}
                aria-label={locConstants.queryResult.messages}
                aria-roledescription={locConstants.queryResult.messages}>
                <DataGridBody<qr.IMessage> itemSize={18} height={messageGridHeight}>
                    {renderRow}
                </DataGridBody>
            </DataGrid>
        );
    };
    //#endregion

    const getWebviewLocation = async () => {
        const res = await context.extensionRpc.sendRequest(qr.GetWebviewLocationRequest.type, {
            uri: uri,
        });
        setWebviewLocation(res);
    };
    const [webviewLocation, setWebviewLocation] = useState("");
    useEffect(() => {
        getWebviewLocation().catch((e) => {
            console.error(e);
            setWebviewLocation("panel");
        });
    }, []);

    useEffect(() => {
        async function loadScrollPosition() {
            if (uri) {
                isProgrammaticScroll.current = true;
                const position = await context?.extensionRpc.sendRequest(
                    qr.GetGridPaneScrollPositionRequest.type,
                    { uri: uri },
                );
                const el = scrollablePanelRef.current;
                if (!el) return;

                requestAnimationFrame(() => {
                    el.scrollTo({
                        top: position?.scrollTop ?? 0,
                        behavior: "instant",
                    });

                    setTimeout(() => {
                        isProgrammaticScroll.current = false;
                    }, 100);
                });
            }
        }

        setTimeout(() => {
            void loadScrollPosition();
        }, 10);
    }, [uri]);

    if (initilizationError) {
        return (
            <div className={classes.root}>
                <div className={classes.noResultsContainer}>
                    <div className={classes.noResultsScrollablePane}>
                        <div className={classes.resultErrorIcon} aria-hidden>
                            <ErrorCircle24Regular />
                        </div>
                        <Title3>{locConstants.queryResult.failedToStartQuery}</Title3>
                        <Text className={classes.noResultMessage}>{initilizationError}</Text>
                    </div>
                </div>
            </div>
        );
    }

    if (!uri || !hasResultsOrMessages(resultSetSummaries, messages)) {
        return (
            <div className={classes.root}>
                <div className={classes.noResultsContainer}>
                    <div className={classes.noResultsScrollablePane}>
                        {webviewLocation === "document" ? (
                            <Spinner
                                label={locConstants.queryResult.loadingResultsMessage}
                                labelPosition="below"
                                size="large"
                            />
                        ) : (
                            <>
                                <div className={classes.noResultsIcon} aria-hidden>
                                    <DatabaseSearch24Regular />
                                </div>
                                <Title3>{locConstants.queryResult.noResultsHeader}</Title3>
                                <Text>{locConstants.queryResult.noResultMessage}</Text>
                                <Link
                                    className={classes.hidePanelLink}
                                    onClick={async () => {
                                        await context.extensionRpc.sendRequest(
                                            ExecuteCommandRequest.type,
                                            {
                                                command: "workbench.action.closePanel",
                                            },
                                        );
                                    }}>
                                    {locConstants.queryResult.clickHereToHideThisPanel}
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={classes.root} ref={resultPaneParentRef}>
            <div className={classes.ribbon} ref={ribbonRef}>
                <TabList
                    size="medium"
                    selectedValue={tabStates!.resultPaneTab}
                    onTabSelect={(_event, data) => {
                        context.setResultTab(data.value as qr.QueryResultPaneTabs);
                    }}
                    className={classes.queryResultPaneTabs}>
                    {Object.keys(resultSetSummaries).length > 0 && (
                        <Tab
                            value={qr.QueryResultPaneTabs.Results}
                            key={qr.QueryResultPaneTabs.Results}>
                            {locConstants.queryResult.results(getGridCount())}
                        </Tab>
                    )}
                    <Tab
                        value={qr.QueryResultPaneTabs.Messages}
                        key={qr.QueryResultPaneTabs.Messages}>
                        {locConstants.queryResult.messages}
                    </Tab>
                    {Object.keys(resultSetSummaries).length > 0 && isExecutionPlan && (
                        <Tab
                            value={qr.QueryResultPaneTabs.ExecutionPlan}
                            key={qr.QueryResultPaneTabs.ExecutionPlan}>
                            {`${locConstants.queryResult.queryPlan} (${executionPlanGraphs?.length || 0})`}
                        </Tab>
                    )}
                </TabList>
                {webviewLocation === "panel" && (
                    <Button
                        icon={<OpenRegular />}
                        iconPosition="after"
                        appearance="subtle"
                        onClick={async () => {
                            await context.extensionRpc.sendRequest(qr.OpenInNewTabRequest.type, {
                                uri: uri!,
                            });
                        }}
                        title={locConstants.queryResult.openResultInNewTab}
                        style={{ marginTop: "4px", marginBottom: "4px" }}>
                        {locConstants.queryResult.openResultInNewTab}
                    </Button>
                )}
            </div>
            <div
                className={classes.tabContent}
                ref={scrollablePanelRef}
                onScroll={(e) => {
                    if (isProgrammaticScroll.current) return;
                    const scrollTop = e.currentTarget.scrollTop;
                    void context.extensionRpc.sendNotification(
                        qr.SetGridPaneScrollPositionNotification.type,
                        { uri: uri, scrollTop },
                    );
                }}>
                {tabStates!.resultPaneTab === qr.QueryResultPaneTabs.Results &&
                    Object.keys(resultSetSummaries).length > 0 &&
                    renderResultPanel()}
                {tabStates!.resultPaneTab === qr.QueryResultPaneTabs.Messages && (
                    <div
                        className={classes.messagesContainer}
                        data-vscode-context={JSON.stringify({
                            webviewSection: "queryResultMessagesPane",
                            uri: uri,
                        })}>
                        {renderMessageGrid()}
                    </div>
                )}
                {tabStates!.resultPaneTab === qr.QueryResultPaneTabs.ExecutionPlan &&
                    isExecutionPlan && (
                        <div
                            id={"executionPlanResultsTab"}
                            className={classes.queryResultContainer}
                            style={{ height: "100%", minHeight: "300px" }}>
                            <ExecutionPlanStateProvider>
                                <ExecutionPlanPage />
                            </ExecutionPlanStateProvider>
                        </div>
                    )}
            </div>
        </div>
    );
};
