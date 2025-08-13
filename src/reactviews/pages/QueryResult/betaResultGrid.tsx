/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useContext, useMemo, useState, useRef, useEffect } from "react";
import { Button, Input, makeStyles, tokens, Spinner } from "@fluentui/react-components";
import {
    ChevronUpRegular,
    ChevronDownRegular,
    CopyRegular,
    DocumentTextRegular,
} from "@fluentui/react-icons";
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    SortingState,
    ColumnFiltersState,
    flexRender,
    createColumnHelper,
    ColumnDef,
} from "@tanstack/react-table";
import { QueryResultContext } from "./queryResultStateProvider";
import * as qr from "../../../sharedInterfaces/queryResult";

export interface BetaResultGridProps {
    loadFunc: (offset: number, count: number) => Thenable<any[]>;
    resultSetSummary?: qr.ResultSetSummary;
    uri?: string;
    webViewState?: any;
    linkHandler: (fileContent: string, fileType: string) => void;
    gridId: string;
}

export interface BetaResultGridHandle {
    refreshGrid: () => void;
    resizeGrid: (width: number, height: number) => void;
    hideGrid: () => void;
    showGrid: () => void;
}

interface TableRow {
    [key: string]: {
        displayValue: string;
        isNull: boolean;
    };
}

interface CellPosition {
    row: number;
    col: number;
}

interface SelectionRange {
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
}

interface SelectionState {
    cells: Set<string>; // "row:col" format
    rows: Set<number>;
    columns: Set<number>;
    ranges: SelectionRange[];
    activeCell: CellPosition | null;
    selectionType: "cell" | "row" | "column" | "range";
}

const useStyles = makeStyles({
    container: {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: tokens.colorNeutralBackground1,
    },
    toolbar: {
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalS,
        padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalXS}`,
        borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
        flexWrap: "wrap",
        height: "28px",
    },
    statusText: {
        marginLeft: "auto",
        fontSize: tokens.fontSizeBase100,
        color: tokens.colorNeutralForeground3,
    },
    tableContainer: {
        flex: 1,
        overflow: "auto",
        backgroundColor: tokens.colorNeutralBackground1,
    },
    table: {
        fontSize: tokens.fontSizeBase100,
        "& thead": {
            position: "sticky",
            top: 0,
            zIndex: 10,
        },
        "& th": {
            backgroundColor: tokens.colorNeutralBackground2,
            borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
            padding: `2px 4px`,
            fontWeight: tokens.fontWeightSemibold,
            fontSize: tokens.fontSizeBase100,
            height: "22px",
            lineHeight: "18px",
            position: "sticky",
            top: 0,
            zIndex: 10,
        },
        "& td": {
            borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
            padding: `1px 4px`,
            fontSize: tokens.fontSizeBase100,
            height: "20px",
            verticalAlign: "middle",
            lineHeight: "18px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
        },
        "& td:first-child": {
            position: "sticky",
            left: 0,
            zIndex: 8,
            backgroundColor: tokens.colorNeutralBackground2,
        },
        "& tr:hover": {
            backgroundColor: tokens.colorNeutralBackground1Hover,
        },
    },
    filterRow: {
        "& th": {
            backgroundColor: tokens.colorNeutralBackground1,
            padding: "1px 2px",
            height: "20px",
            position: "sticky",
            top: "22px",
            zIndex: 10,
        },
        "& th:first-child": {
            position: "sticky",
            left: 0,
            zIndex: 11,
        },
    },
    headerCell: {
        cursor: "pointer",
        userSelect: "none",
        display: "flex",
        alignItems: "center",
        gap: tokens.spacingHorizontalXXS,
        height: "100%",
        "&:hover": {
            backgroundColor: tokens.colorNeutralBackground2Hover,
        },
    },
    sortIcon: {
        fontSize: "12px",
        color: tokens.colorNeutralForeground3,
    },
    nullCell: {
        color: tokens.colorNeutralForeground3,
        fontStyle: "italic",
    },
    filterInput: {
        width: "100%",
        height: "18px",
        fontSize: tokens.fontSizeBase100,
    },
    loadingContainer: {
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "200px",
        gap: tokens.spacingHorizontalS,
    },
    selectingRow: {
        backgroundColor: tokens.colorNeutralBackground1Pressed,
    },
    selectedRow: {
        backgroundColor: tokens.colorNeutralBackground1Selected,
    },
    selectedCell: {
        backgroundColor: tokens.colorBrandBackground2,
        outline: `2px solid ${tokens.colorBrandStroke1}`,
    },
    selectedColumn: {
        backgroundColor: tokens.colorNeutralBackground1Selected,
    },
    rowNumber: {
        backgroundColor: tokens.colorNeutralBackground2,
        textAlign: "center" as const,
        fontWeight: tokens.fontWeightSemibold,
        cursor: "pointer",
        userSelect: "none" as const,
        width: "35px",
        minWidth: "35px",
        fontSize: tokens.fontSizeBase100,
        padding: "1px 2px",
        position: "sticky",
        left: 0,
        zIndex: 9,
        "&:hover": {
            backgroundColor: tokens.colorNeutralBackground2Hover,
        },
    },
    activeCell: {
        outline: `2px solid ${tokens.colorBrandStroke1}`,
        outlineOffset: "-2px",
    },
});

const BetaResultGrid = React.forwardRef<BetaResultGridHandle, BetaResultGridProps>(
    (props: BetaResultGridProps, ref) => {
        const context = useContext(QueryResultContext);
        const styles = useStyles();

        if (!context || !props.resultSetSummary) {
            return null;
        }

        const [data, setData] = useState<TableRow[]>([]);
        const [loading, setLoading] = useState(false);
        const [sorting, setSorting] = useState<SortingState>([]);
        const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

        // Custom selection state
        const [selection, setSelection] = useState<SelectionState>({
            cells: new Set(),
            rows: new Set(),
            columns: new Set(),
            ranges: [],
            activeCell: null,
            selectionType: "cell",
        });
        const [isSelecting, setIsSelecting] = useState(false);
        const [selectionStart, setSelectionStart] = useState<CellPosition | null>(null);
        const [autoScrollInterval, setAutoScrollInterval] = useState<NodeJS.Timeout | null>(null);

        const containerRef = useRef<HTMLDivElement>(null);
        const tableContainerRef = useRef<HTMLDivElement>(null);

        // Load data from the backend
        const loadData = useCallback(async () => {
            if (!props.resultSetSummary) return;

            setLoading(true);
            try {
                const rows = await props.loadFunc(0, props.resultSetSummary.rowCount || 1000);
                setData(rows);
            } catch (error) {
                console.error("Failed to load data:", error);
            } finally {
                setLoading(false);
            }
        }, [props.loadFunc, props.resultSetSummary]);

        useEffect(() => {
            void loadData();
        }, [loadData]);

        // Create columns using TanStack Table
        const columnHelper = createColumnHelper<TableRow>();

        const columns = useMemo<ColumnDef<TableRow, any>[]>(() => {
            if (!props.resultSetSummary) return [];

            return props.resultSetSummary.columnInfo.map((col, index) =>
                columnHelper.accessor(`${index}`, {
                    id: `col_${index}`,
                    header: col.columnName || `Column ${index + 1}`,
                    cell: (info) => {
                        const cellData = info.getValue() as
                            | { displayValue: string; isNull: boolean }
                            | undefined;
                        const displayValue = cellData?.displayValue || "";
                        const isNull = cellData?.isNull || false;

                        return (
                            <span className={isNull ? styles.nullCell : undefined}>
                                {isNull ? "(null)" : displayValue}
                            </span>
                        );
                    },
                    sortingFn: (rowA, rowB, columnId) => {
                        const aVal =
                            (rowA.getValue(columnId) as { displayValue: string })?.displayValue ||
                            "";
                        const bVal =
                            (rowB.getValue(columnId) as { displayValue: string })?.displayValue ||
                            "";
                        return aVal.localeCompare(bVal);
                    },
                    filterFn: (row, columnId, filterValue) => {
                        const cellValue =
                            (row.getValue(columnId) as { displayValue: string })?.displayValue ||
                            "";
                        return cellValue.toLowerCase().includes(filterValue.toLowerCase());
                    },
                }),
            );
        }, [props.resultSetSummary, columnHelper, styles.nullCell]);

        const table = useReactTable({
            data,
            columns,
            state: {
                sorting,
                columnFilters,
            },
            onSortingChange: setSorting,
            onColumnFiltersChange: setColumnFilters,
            getCoreRowModel: getCoreRowModel(),
            getSortedRowModel: getSortedRowModel(),
            getFilteredRowModel: getFilteredRowModel(),
            enableRowSelection: false, // We handle selection manually
        });

        // Selection utility functions
        const getCellKey = useCallback((row: number, col: number) => `${row}:${col}`, []);

        const isCellSelected = useCallback(
            (row: number, col: number) => {
                return (
                    selection.cells.has(getCellKey(row, col)) ||
                    selection.rows.has(row) ||
                    selection.columns.has(col)
                );
            },
            [selection, getCellKey],
        );

        const isRowSelected = useCallback(
            (row: number) => {
                return selection.rows.has(row);
            },
            [selection],
        );

        const isColumnSelected = useCallback(
            (col: number) => {
                return selection.columns.has(col);
            },
            [selection],
        );

        // Cell selection handlers
        const handleCellMouseDown = useCallback(
            (row: number, col: number, event: React.MouseEvent) => {
                event.preventDefault();

                const isCtrlCmd = event.ctrlKey || event.metaKey;
                const isShift = event.shiftKey;
                const cellKey = getCellKey(row, col);

                if (isShift && selection.activeCell) {
                    // Shift click - select range
                    const startRow = Math.min(selection.activeCell.row, row);
                    const endRow = Math.max(selection.activeCell.row, row);
                    const startCol = Math.min(selection.activeCell.col, col);
                    const endCol = Math.max(selection.activeCell.col, col);

                    const newCells = new Set(isCtrlCmd ? selection.cells : new Set<string>());
                    for (let r = startRow; r <= endRow; r++) {
                        for (let c = startCol; c <= endCol; c++) {
                            newCells.add(getCellKey(r, c));
                        }
                    }

                    setSelection((prev) => ({
                        ...prev,
                        cells: newCells,
                        rows: new Set(),
                        columns: new Set(),
                        selectionType: "range",
                    }));
                } else if (isCtrlCmd) {
                    // Ctrl/Cmd click - toggle cell
                    const newCells = new Set(selection.cells);
                    if (newCells.has(cellKey)) {
                        newCells.delete(cellKey);
                    } else {
                        newCells.add(cellKey);
                    }

                    setSelection((prev) => ({
                        ...prev,
                        cells: newCells,
                        rows: new Set(),
                        columns: new Set(),
                        activeCell: { row, col },
                        selectionType: "cell",
                    }));
                } else {
                    // Regular click - select single cell
                    setSelection({
                        cells: new Set([cellKey]),
                        rows: new Set(),
                        columns: new Set(),
                        ranges: [],
                        activeCell: { row, col },
                        selectionType: "cell",
                    });
                    setIsSelecting(true);
                    setSelectionStart({ row, col });

                    // Start auto-scroll timer for drag operations
                    const interval = setInterval(() => {
                        if (isSelecting) {
                            // Auto-scroll will be handled in mouse move events
                        }
                    }, 16); // ~60fps
                    setAutoScrollInterval(interval);
                }
            },
            [selection, getCellKey],
        );

        // Row number click handler
        const handleRowNumberClick = useCallback(
            (row: number, event: React.MouseEvent) => {
                event.preventDefault();

                const isCtrlCmd = event.ctrlKey || event.metaKey;
                const isShift = event.shiftKey;

                if (isShift && selection.activeCell) {
                    // Shift click - select row range
                    const startRow = Math.min(selection.activeCell.row, row);
                    const endRow = Math.max(selection.activeCell.row, row);

                    const newRows = new Set(isCtrlCmd ? selection.rows : new Set<number>());
                    for (let r = startRow; r <= endRow; r++) {
                        newRows.add(r);
                    }

                    setSelection((prev) => ({
                        ...prev,
                        cells: new Set(),
                        rows: newRows,
                        columns: new Set(),
                        activeCell: { row, col: 0 },
                        selectionType: "row",
                    }));
                } else if (isCtrlCmd) {
                    // Ctrl/Cmd click - toggle row
                    const newRows = new Set(selection.rows);
                    if (newRows.has(row)) {
                        newRows.delete(row);
                    } else {
                        newRows.add(row);
                    }

                    setSelection((prev) => ({
                        ...prev,
                        cells: new Set(),
                        rows: newRows,
                        columns: new Set(),
                        activeCell: { row, col: 0 },
                        selectionType: "row",
                    }));
                } else {
                    // Regular click - select single row
                    setSelection({
                        cells: new Set(),
                        rows: new Set([row]),
                        columns: new Set(),
                        ranges: [],
                        activeCell: { row, col: 0 },
                        selectionType: "row",
                    });
                }
            },
            [selection],
        );

        // Column header click handler
        const handleColumnHeaderClick = useCallback(
            (col: number, event: React.MouseEvent) => {
                event.preventDefault();
                event.stopPropagation(); // Prevent sorting

                const isCtrlCmd = event.ctrlKey || event.metaKey;
                const isShift = event.shiftKey;

                if (isShift && selection.activeCell) {
                    // Shift click - select column range
                    const startCol = Math.min(selection.activeCell.col, col);
                    const endCol = Math.max(selection.activeCell.col, col);

                    const newColumns = new Set(isCtrlCmd ? selection.columns : new Set<number>());
                    for (let c = startCol; c <= endCol; c++) {
                        newColumns.add(c);
                    }

                    setSelection((prev) => ({
                        ...prev,
                        cells: new Set(),
                        rows: new Set(),
                        columns: newColumns,
                        activeCell: { row: 0, col },
                        selectionType: "column",
                    }));
                } else if (isCtrlCmd) {
                    // Ctrl/Cmd click - toggle column
                    const newColumns = new Set(selection.columns);
                    if (newColumns.has(col)) {
                        newColumns.delete(col);
                    } else {
                        newColumns.add(col);
                    }

                    setSelection((prev) => ({
                        ...prev,
                        cells: new Set(),
                        rows: new Set(),
                        columns: newColumns,
                        activeCell: { row: 0, col },
                        selectionType: "column",
                    }));
                } else {
                    // Regular click - select single column
                    setSelection({
                        cells: new Set(),
                        rows: new Set(),
                        columns: new Set([col]),
                        ranges: [],
                        activeCell: { row: 0, col },
                        selectionType: "column",
                    });
                }
            },
            [selection],
        );

        // Auto-scroll during drag selection
        const handleAutoScroll = useCallback((clientX: number, clientY: number) => {
            const container = tableContainerRef.current;
            if (!container) return;

            const containerRect = container.getBoundingClientRect();
            const scrollZone = 50; // pixels from edge to trigger scroll
            const scrollSpeed = 5; // pixels per interval

            // Vertical scrolling
            if (clientY < containerRect.top + scrollZone) {
                // Scroll up
                container.scrollTop = Math.max(0, container.scrollTop - scrollSpeed);
            } else if (clientY > containerRect.bottom - scrollZone) {
                // Scroll down
                container.scrollTop = Math.min(
                    container.scrollHeight - container.clientHeight,
                    container.scrollTop + scrollSpeed,
                );
            }

            // Horizontal scrolling
            if (clientX < containerRect.left + scrollZone) {
                // Scroll left
                container.scrollLeft = Math.max(0, container.scrollLeft - scrollSpeed);
            } else if (clientX > containerRect.right - scrollZone) {
                // Scroll right
                container.scrollLeft = Math.min(
                    container.scrollWidth - container.clientWidth,
                    container.scrollLeft + scrollSpeed,
                );
            }
        }, []);

        // Drag selection with auto-scroll
        const handleCellMouseEnter = useCallback(
            (row: number, col: number, event: React.MouseEvent) => {
                if (isSelecting && event.buttons === 1 && selectionStart) {
                    const startRow = Math.min(selectionStart.row, row);
                    const endRow = Math.max(selectionStart.row, row);
                    const startCol = Math.min(selectionStart.col, col);
                    const endCol = Math.max(selectionStart.col, col);

                    const newCells = new Set<string>();
                    for (let r = startRow; r <= endRow; r++) {
                        for (let c = startCol; c <= endCol; c++) {
                            newCells.add(getCellKey(r, c));
                        }
                    }

                    setSelection((prev) => ({
                        ...prev,
                        cells: newCells,
                        rows: new Set(),
                        columns: new Set(),
                        selectionType: "range",
                    }));

                    // Trigger auto-scroll if near edges
                    handleAutoScroll(event.clientX, event.clientY);
                }
            },
            [isSelecting, selectionStart, getCellKey, handleAutoScroll],
        );

        const handleMouseUp = useCallback(() => {
            setIsSelecting(false);
            if (autoScrollInterval) {
                clearInterval(autoScrollInterval);
                setAutoScrollInterval(null);
            }
        }, [autoScrollInterval]);

        // Add global mouse up and mouse move listeners
        useEffect(() => {
            const handleGlobalMouseMove = (e: MouseEvent) => {
                if (isSelecting && tableContainerRef.current) {
                    handleAutoScroll(e.clientX, e.clientY);
                }
            };

            document.addEventListener("mouseup", handleMouseUp);
            document.addEventListener("mousemove", handleGlobalMouseMove);

            return () => {
                document.removeEventListener("mouseup", handleMouseUp);
                document.removeEventListener("mousemove", handleGlobalMouseMove);
            };
        }, [handleMouseUp, isSelecting, handleAutoScroll]);

        // Copy selection functionality
        const copySelection = useCallback(async () => {
            if (
                selection.cells.size === 0 &&
                selection.rows.size === 0 &&
                selection.columns.size === 0
            ) {
                return;
            }

            const selectedData: string[][] = [];
            const allRows = table.getFilteredRowModel().rows;
            const allColumns = table.getVisibleLeafColumns();

            // Determine what to copy based on selection type
            if (selection.rows.size > 0) {
                // Copy selected rows
                const headers = allColumns.map((column) => column.columnDef.header as string);
                selectedData.push(headers);

                Array.from(selection.rows)
                    .sort()
                    .forEach((rowIndex) => {
                        if (rowIndex < allRows.length) {
                            const row = allRows[rowIndex];
                            const rowData = allColumns.map((column) => {
                                const cellValue = row.getValue(column.id) as {
                                    displayValue: string;
                                    isNull: boolean;
                                };
                                return cellValue?.isNull ? "" : cellValue?.displayValue || "";
                            });
                            selectedData.push(rowData);
                        }
                    });
            } else if (selection.columns.size > 0) {
                // Copy selected columns
                const selectedCols = Array.from(selection.columns).sort();
                const headers = selectedCols.map(
                    (colIndex) => allColumns[colIndex]?.columnDef.header as string,
                );
                selectedData.push(headers);

                allRows.forEach((row) => {
                    const rowData = selectedCols.map((colIndex) => {
                        const column = allColumns[colIndex];
                        if (column) {
                            const cellValue = row.getValue(column.id) as {
                                displayValue: string;
                                isNull: boolean;
                            };
                            return cellValue?.isNull ? "" : cellValue?.displayValue || "";
                        }
                        return "";
                    });
                    selectedData.push(rowData);
                });
            } else if (selection.cells.size > 0) {
                // Copy selected cells
                const cellPositions = Array.from(selection.cells)
                    .map((cellKey) => {
                        const [row, col] = cellKey.split(":").map(Number);
                        return { row, col };
                    })
                    .sort((a, b) => a.row - b.row || a.col - b.col);

                // Group by rows
                const rowGroups = new Map<number, number[]>();
                cellPositions.forEach(({ row, col }) => {
                    if (!rowGroups.has(row)) {
                        rowGroups.set(row, []);
                    }
                    rowGroups.get(row)!.push(col);
                });

                // Add data for each row group
                Array.from(rowGroups.keys())
                    .sort()
                    .forEach((rowIndex) => {
                        const cols = rowGroups.get(rowIndex)!.sort();
                        if (rowIndex < allRows.length) {
                            const row = allRows[rowIndex];
                            const rowData = cols.map((colIndex) => {
                                const column = allColumns[colIndex];
                                if (column) {
                                    const cellValue = row.getValue(column.id) as {
                                        displayValue: string;
                                        isNull: boolean;
                                    };
                                    return cellValue?.isNull ? "" : cellValue?.displayValue || "";
                                }
                                return "";
                            });
                            selectedData.push(rowData);
                        }
                    });
            }

            // Convert to CSV format
            const csvContent = selectedData
                .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
                .join("\n");

            // Copy to clipboard
            try {
                await navigator.clipboard.writeText(csvContent);
                context.log("Data copied to clipboard");
            } catch (error) {
                console.error("Failed to copy to clipboard:", error);
            }
        }, [table, context, selection]);

        // Export functionality
        const exportData = useCallback(
            async (format: "csv" | "json") => {
                const rows = table.getFilteredRowModel().rows;
                const allData = rows.map((row) =>
                    table.getVisibleLeafColumns().map((column) => {
                        const cellValue = row.getValue(column.id) as {
                            displayValue: string;
                            isNull: boolean;
                        };
                        return cellValue?.isNull ? null : cellValue?.displayValue || "";
                    }),
                );

                let content = "";
                let mimeType = "";
                let fileName = "";

                switch (format) {
                    case "csv":
                        const headers = table
                            .getVisibleLeafColumns()
                            .map((column) => column.columnDef.header as string);
                        const csvRows = [headers, ...allData];
                        content = csvRows
                            .map((row) =>
                                row
                                    .map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`)
                                    .join(","),
                            )
                            .join("\n");
                        mimeType = "text/csv";
                        fileName = "results.csv";
                        break;

                    case "json":
                        const jsonData = allData.map((row) => {
                            const obj: Record<string, any> = {};
                            table.getVisibleLeafColumns().forEach((column, index) => {
                                obj[column.columnDef.header as string] = row[index];
                            });
                            return obj;
                        });
                        content = JSON.stringify(jsonData, null, 2);
                        mimeType = "application/json";
                        fileName = "results.json";
                        break;
                }

                // Create download link
                const blob = new Blob([content], { type: mimeType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            },
            [table],
        );

        // Expose methods via ref
        React.useImperativeHandle(ref, () => ({
            refreshGrid: () => {
                void loadData();
            },
            resizeGrid: (width: number, height: number) => {
                if (containerRef.current) {
                    containerRef.current.style.width = `${width}px`;
                    containerRef.current.style.height = `${height}px`;
                }
            },
            hideGrid: () => {
                if (containerRef.current) {
                    containerRef.current.style.display = "none";
                }
            },
            showGrid: () => {
                if (containerRef.current) {
                    containerRef.current.style.display = "flex";
                }
            },
        }));

        if (loading) {
            return (
                <div className={styles.loadingContainer}>
                    <Spinner size="small" />
                    <span>Loading...</span>
                </div>
            );
        }

        const selectedItemsCount =
            selection.cells.size + selection.rows.size + selection.columns.size;
        const filteredRowsCount = table.getFilteredRowModel().rows.length;
        const totalRowsCount = data.length;

        return (
            <div ref={containerRef} className={styles.container}>
                {/* Toolbar */}
                <div className={styles.toolbar}>
                    <Button
                        size="small"
                        appearance="subtle"
                        icon={<CopyRegular />}
                        onClick={copySelection}
                        disabled={selectedItemsCount === 0}
                        style={{ height: "24px", fontSize: tokens.fontSizeBase100 }}>
                        Copy ({selectedItemsCount})
                    </Button>
                    <Button
                        size="small"
                        appearance="subtle"
                        icon={<DocumentTextRegular />}
                        onClick={() => exportData("csv")}
                        style={{ height: "24px", fontSize: tokens.fontSizeBase100 }}>
                        CSV
                    </Button>
                    <Button
                        size="small"
                        appearance="subtle"
                        icon={<DocumentTextRegular />}
                        onClick={() => exportData("json")}
                        style={{ height: "24px", fontSize: tokens.fontSizeBase100 }}>
                        JSON
                    </Button>
                    <div className={styles.statusText}>
                        {filteredRowsCount} rows
                        {filteredRowsCount !== totalRowsCount &&
                            ` (filtered from ${totalRowsCount})`}
                        {selectedItemsCount > 0 && ` • ${selectedItemsCount} selected`}
                    </div>
                </div>

                {/* Table Container */}
                <div className={styles.tableContainer} ref={tableContainerRef}>
                    <table className={styles.table}>
                        <thead>
                            {/* Header Row */}
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr key={headerGroup.id}>
                                    {/* Row Number Header */}
                                    <th
                                        className={styles.rowNumber}
                                        style={{
                                            width: "35px",
                                            position: "sticky",
                                            left: 0,
                                            top: 0,
                                            zIndex: 12,
                                        }}>
                                        #
                                    </th>
                                    {headerGroup.headers.map((header, colIndex) => (
                                        <th
                                            key={header.id}
                                            style={{ minWidth: "80px" }}
                                            className={
                                                isColumnSelected(colIndex)
                                                    ? styles.selectedColumn
                                                    : undefined
                                            }>
                                            <div
                                                className={styles.headerCell}
                                                onClick={(e) => {
                                                    if (e.ctrlKey || e.metaKey || e.shiftKey) {
                                                        handleColumnHeaderClick(colIndex, e);
                                                    } else {
                                                        header.column.getToggleSortingHandler()?.(
                                                            e,
                                                        );
                                                    }
                                                }}>
                                                {flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext(),
                                                )}
                                                <span className={styles.sortIcon}>
                                                    {{
                                                        asc: <ChevronUpRegular />,
                                                        desc: <ChevronDownRegular />,
                                                    }[header.column.getIsSorted() as string] ??
                                                        null}
                                                </span>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            ))}
                            {/* Filter Row */}
                            <tr className={styles.filterRow}>
                                <th style={{ width: "35px" }}></th>
                                {table.getVisibleLeafColumns().map((column) => (
                                    <th key={column.id}>
                                        <Input
                                            size="small"
                                            className={styles.filterInput}
                                            placeholder="Filter..."
                                            value={(column.getFilterValue() as string) ?? ""}
                                            onChange={(e) => column.setFilterValue(e.target.value)}
                                        />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {table.getRowModel().rows.map((row, rowIndex) => (
                                <tr
                                    key={row.id}
                                    className={
                                        isRowSelected(rowIndex) ? styles.selectedRow : undefined
                                    }>
                                    {/* Row Number Cell */}
                                    <td
                                        className={`${styles.rowNumber} ${isRowSelected(rowIndex) ? styles.selectedRow : ""}`}
                                        onClick={(e) => handleRowNumberClick(rowIndex, e)}
                                        style={{
                                            cursor: "pointer",
                                            userSelect: "none",
                                            position: "sticky",
                                            left: 0,
                                            zIndex: 8,
                                            backgroundColor: isRowSelected(rowIndex)
                                                ? tokens.colorNeutralBackground1Selected
                                                : tokens.colorNeutralBackground2,
                                        }}>
                                        {rowIndex + 1}
                                    </td>
                                    {row.getVisibleCells().map((cell, colIndex) => {
                                        const isSelected = isCellSelected(rowIndex, colIndex);
                                        const isActive =
                                            selection.activeCell?.row === rowIndex &&
                                            selection.activeCell?.col === colIndex;
                                        return (
                                            <td
                                                key={cell.id}
                                                className={`
                                                    ${isSelected ? styles.selectedCell : ""}
                                                    ${isActive ? styles.activeCell : ""}
                                                    ${isColumnSelected(colIndex) ? styles.selectedColumn : ""}
                                                `.trim()}
                                                onMouseDown={(e) =>
                                                    handleCellMouseDown(rowIndex, colIndex, e)
                                                }
                                                onMouseEnter={(e) =>
                                                    handleCellMouseEnter(rowIndex, colIndex, e)
                                                }
                                                style={{
                                                    cursor: "pointer",
                                                    userSelect: "none",
                                                }}>
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext(),
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    },
);

BetaResultGrid.displayName = "BetaResultGrid";
export default BetaResultGrid;
