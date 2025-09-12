/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { QueryResultCommandsContext } from "./queryResultStateProvider";
import * as qr from "../../../sharedInterfaces/queryResult";
import DataEditor, { GridCell, GridCellKind, Item } from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { GridContextMenuAction } from "../../../sharedInterfaces/queryResult";
import { useQueryResultSelector } from "./queryResultSelector";
import {
    Menu,
    MenuItem,
    MenuList,
    MenuPopover,
    Button,
    Input,
    Text,
    Field,
} from "@fluentui/react-components";
import { Editor } from "@monaco-editor/react";
import { useVscodeWebview2 } from "../../common/vscodeWebviewProvider2";
import { resolveVscodeThemeType } from "../../common/utils";

interface BetaResultGridProps {
    uri: string;
    resultSetSummary: qr.ResultSetSummary;
    style?: React.CSSProperties;
}

// A simple, local row cache keyed by row index. Each entry is an array of
// string display values for each column.
type RowCache = Map<number, string[]>;

const CHUNK_SIZE = 100; // fetch in chunks to reduce RPC calls

export const BetaResultGrid: React.FC<BetaResultGridProps> = ({ uri, resultSetSummary, style }) => {
    const context = useContext(QueryResultCommandsContext);
    const { themeKind } = useVscodeWebview2();
    const rowCacheRef = useRef<RowCache>(new Map());
    const inflightRef = useRef<Set<number>>(new Set());
    const [version, setVersion] = useState(0); // bumps to re-query getCellContent lazily
    const [gridSelection, setGridSelection] = useState<any>(undefined);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const rowCount = resultSetSummary?.rowCount ?? 0;
    const inMemoryThreshold =
        useQueryResultSelector<number | undefined>((s) => s.inMemoryDataProcessingThreshold) ??
        5000;

    const [fullData, setFullData] = useState<string[][] | null>(null); // all rows for in-memory ops
    const [viewRows, setViewRows] = useState<number[]>([]); // index mapping after filtering/sorting
    const [sortState, setSortState] = useState<{ col: number; dir: "asc" | "desc" | null }>({
        col: -1,
        dir: null,
    });
    const [filters, setFilters] = useState<Map<number, { value: string }>>(new Map());
    const [frozenCols, setFrozenCols] = useState<number>(0); // keep rownum frozen
    const [headerMenu, setHeaderMenu] = useState<{
        open: boolean;
        x: number;
        y: number;
        col: number;
    }>({ open: false, x: 0, y: 0, col: -1 });
    // no debounce; toggle deterministically
    const sortIconRectsRef = useRef<Map<number, { x: number; y: number; w: number; h: number }>>(
        new Map(),
    );
    const [selSummary, setSelSummary] = useState<{
        rows: number;
        cells: number;
        numeric: boolean;
        sum?: number;
        avg?: number;
    }>({ rows: 0, cells: 0, numeric: false });

    const [overlay, setOverlay] = useState<{
        open: boolean;
        content: string;
        title?: string;
        lang?: string;
    }>({ open: false, content: "" });

    const baseCols = useMemo(() => {
        const dataCols = (resultSetSummary?.columnInfo ?? []).map((c, i) => ({
            id: String(i),
            title:
                c.columnName === "Microsoft SQL Server 2005 XML Showplan"
                    ? "Showplan XML"
                    : c.columnName,
            hasMenu: true,
            menuIcon: "dots",
        }));
        // Prepend a row-number column (compact width)
        return [...dataCols];
    }, [resultSetSummary?.columnInfo]);

    const [cols, setCols] = useState<any[]>(baseCols);
    const compactTheme = useMemo(() => {
        const css = getComputedStyle(document.documentElement);
        const get = (v: string, fb: string) => css.getPropertyValue(v).trim() || fb;

        const editorBg = get("--vscode-editor-background", "#1e1e1e");
        const editorFg = get("--vscode-editor-foreground", "#cccccc");
        const selectionBg = get("--vscode-editor-selectionBackground", "#264f78");
        const selectionLight = get("--vscode-editor-selectionHighlightBackground", selectionBg);
        const widgetBg = get("--vscode-editorWidget-background", editorBg);
        const widgetBorder = get("--vscode-editorWidget-border", "#333");
        const panelBorder = get("--vscode-panel-border", widgetBorder);
        const focusBorder = get("--vscode-focusBorder", selectionBg);
        const listHoverBg = get("--vscode-list-hoverBackground", selectionLight);
        const listActiveSelBg = get("--vscode-list-activeSelectionBackground", selectionBg);
        const listActiveSelFg = get("--vscode-list-activeSelectionForeground", editorFg);
        const descFg = get("--vscode-descriptionForeground", editorFg);
        const disabledFg = get("--vscode-disabledForeground", descFg);
        const badgeBg = get("--vscode-badge-background", selectionBg);
        const badgeFg = get("--vscode-badge-foreground", editorFg);
        const sidebarHeaderBg = get("--vscode-sideBarSectionHeader-background", widgetBg);
        const linkFg = get("--vscode-textLink-foreground", listActiveSelBg);

        // Font styles
        const fontSizePx = parseInt(getComputedStyle(document.body).fontSize || "12", 10);
        const fontFamily =
            getComputedStyle(document.body).fontFamily ||
            get("--vscode-font-family", "var(--vscode-editor-font-family), sans-serif");

        return {
            // Accents
            accentColor: focusBorder,
            accentFg: listActiveSelFg,
            accentLight: selectionLight,
            // Text
            textDark: editorFg,
            textMedium: descFg,
            textLight: disabledFg,
            textBubble: badgeFg,
            textHeader: editorFg,
            textGroupHeader: editorFg,
            textHeaderSelected: listActiveSelFg,
            // Icons
            bgIconHeader: listHoverBg,
            fgIconHeader: editorFg,
            // Backgrounds
            bgCell: editorBg,
            bgCellMedium: widgetBg,
            bgHeader: widgetBg,
            bgHeaderHasFocus: listActiveSelBg,
            bgHeaderHovered: listHoverBg,
            bgGroupHeader: sidebarHeaderBg,
            bgGroupHeaderHovered: listHoverBg,
            bgBubble: badgeBg,
            bgBubbleSelected: listActiveSelBg,
            bgSearchResult: get("--vscode-editor-findMatchHighlightBackground", selectionLight),
            // Borders
            borderColor: widgetBorder,
            horizontalBorderColor: panelBorder,
            drilldownBorder: focusBorder,
            // Links
            linkColor: linkFg,
            // Sizing / font
            cellHorizontalPadding: 4,
            cellVerticalPadding: 2,
            headerFontStyle: `bold ${Math.max(12, fontSizePx)}px`,
            baseFontStyle: `${Math.max(12, fontSizePx)}px`,
            fontFamily,
            editorFontSize: `${Math.max(12, fontSizePx)}px`,
            lineHeight: 1.3,
            checkboxMaxSize: 14,
            roundingRadius: 4,
        } as any;
    }, []);

    useEffect(() => {
        setCols(baseCols);
    }, [baseCols]);

    useEffect(() => {
        // Update titles to reflect sort direction, frozen state, and active filters
        setCols((prev) =>
            prev.map((c, idx) => {
                let title: string;

                const ci = resultSetSummary?.columnInfo?.[idx];
                title = ci
                    ? ci.columnName === "Microsoft SQL Server 2005 XML Showplan"
                        ? "Showplan XML"
                        : ci.columnName
                    : (c.title ?? "");

                if (idx < frozenCols) title += " ❄";
                if (idx > 0 && sortState.col === idx - 1 && sortState.dir) {
                    title += sortState.dir === "asc" ? " ▲" : " ▼";
                }
                // Active filter indicator (magnifying glass)
                if (idx > 0 && (filters.get(idx - 1)?.value ?? "").trim() !== "") {
                    title += " 🔎";
                }
                return { ...c, title };
            }),
        );
    }, [frozenCols, sortState, filters, resultSetSummary?.columnInfo]);

    const fetchChunk = useCallback(
        async (start: number) => {
            if (!context) return;
            const key = Math.floor(start / CHUNK_SIZE);
            if (inflightRef.current.has(key)) return; // avoid duplicate fetch
            inflightRef.current.add(key);
            try {
                const maxRows = Math.max(resultSetSummary?.rowCount ?? 0, 0);
                const fetchStart = Math.min(start, Math.max(maxRows - 1, 0));
                const fetchCount = Math.min(CHUNK_SIZE, Math.max(maxRows - fetchStart, 0));
                if (fetchCount <= 0) return;

                const res = await context.extensionRpc.sendRequest(qr.GetRowsRequest.type, {
                    uri,
                    batchId: resultSetSummary.batchId,
                    resultId: resultSetSummary.id,
                    rowStart: fetchStart,
                    numberOfRows: fetchCount,
                });
                const subset = res as qr.ResultSetSubset | undefined;
                if (!subset?.rows) return;

                const colCount = resultSetSummary.columnInfo?.length ?? 0;
                subset.rows.forEach((row, i) => {
                    const rowIndex = fetchStart + i;
                    const values: string[] = new Array(colCount);
                    for (let c = 0; c < colCount; c++) {
                        const cell = row[c];
                        values[c] = cell?.isNull ? "NULL" : (cell?.displayValue ?? "");
                    }
                    rowCacheRef.current.set(rowIndex, values);
                });
                // bump version to cause DataEditor to re-query getCellContent lazily
                setVersion((v) => v + 1);
            } finally {
                inflightRef.current.delete(key);
            }
        },
        [
            context,
            uri,
            resultSetSummary?.batchId,
            resultSetSummary?.id,
            resultSetSummary?.rowCount,
            resultSetSummary?.columnInfo?.length,
        ],
    );

    // Measure text widths for the first N rows and headers to set column widths
    useEffect(() => {
        let disposed = false;
        const SAMPLE_ROWS = 50;
        const MIN_W = 60;
        const MAX_W = 420;

        const measure = (text: string, ctx: CanvasRenderingContext2D) => {
            if (!text) return 0;
            return Math.ceil(ctx.measureText(text).width);
        };

        const compute = async () => {
            // Ensure we have at least the first chunk
            await fetchChunk(0);
            if (disposed) return;

            // Prepare canvas
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            // Try to use the actual computed font from wrapper
            const fontSize = parseInt(
                window.getComputedStyle(wrapperRef.current ?? document.body).fontSize || "12",
                10,
            );
            const fontFamily = window.getComputedStyle(
                wrapperRef.current ?? document.body,
            ).fontFamily;
            ctx.font = `${fontSize}px ${fontFamily || "sans-serif"}`;

            const colCount = resultSetSummary?.columnInfo?.length ?? 0;
            const widths: number[] = new Array(colCount).fill(0);

            // Include header titles
            for (let c = 0; c < colCount; c++) {
                const headerText = resultSetSummary.columnInfo[c]?.columnName ?? "";
                widths[c] = Math.max(widths[c], measure(headerText, ctx));
            }

            // Sample first N rows from cache
            for (let r = 0; r < Math.min(SAMPLE_ROWS, resultSetSummary?.rowCount ?? 0); r++) {
                const row = rowCacheRef.current.get(r);
                if (!row) continue;
                for (let c = 0; c < colCount; c++) {
                    const val = row[c] ?? "";
                    widths[c] = Math.max(widths[c], measure(val, ctx));
                }
            }

            // Add small padding and clamp
            const finalDataCols = widths.map((w) => Math.min(MAX_W, Math.max(MIN_W, w + 20)));
            if (disposed) return;
            // Apply to columns (data columns only; row marker is separate)
            setCols((prev) => {
                const next = prev.map((col) => ({ ...col }));
                for (let i = 0; i < finalDataCols.length; i++) {
                    const targetIndex = i;
                    if (next[targetIndex]) next[targetIndex].width = finalDataCols[i];
                }
                return next;
            });
        };

        void compute();
        return () => {
            disposed = true;
        };
        // Recompute when schema or rowCount changes
    }, [resultSetSummary?.id, resultSetSummary?.rowCount, fetchChunk]);

    const getCellContent = useCallback(
        (item: Item): GridCell => {
            const [col, row] = item;

            // If we have viewRows (filtered/sorted), map row index
            const sourceRow = viewRows.length > 0 ? viewRows[row] : row;

            const cached = rowCacheRef.current.get(sourceRow);
            const dataColIndex = col;
            if (cached && cached[dataColIndex] !== undefined) {
                const val = cached[dataColIndex] ?? "";
                return {
                    kind: GridCellKind.Text,
                    data: val,
                    displayData: val,
                    allowOverlay: true,
                };
            }

            // trigger fetch lazily for the chunk containing this row
            void fetchChunk(sourceRow);

            return {
                kind: GridCellKind.Text,
                data: "",
                displayData: "",
                allowOverlay: true,
            };
        },
        [fetchChunk, version],
    );

    // Compute selection aggregates (sum/avg) and counts
    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            const current = gridSelection?.current?.range;
            if (!current) {
                if (!cancelled) setSelSummary({ rows: 0, cells: 0, numeric: false });
                return;
            }
            const startRow = current.y;
            const endRow = current.y + current.height - 1;
            const startCol = current.x;
            const endCol = current.x + current.width - 1;
            const visibleRows = viewRows.length > 0 ? viewRows : undefined;

            // Ensure required chunks are fetched
            const sourceRowIndices: number[] = [];
            for (let r = startRow; r <= endRow; r++) {
                const source = visibleRows ? visibleRows[r] : r;
                if (source >= 0 && source < rowCount) sourceRowIndices.push(source);
            }
            const chunkStarts = Array.from(
                new Set(sourceRowIndices.map((sr) => Math.floor(sr / CHUNK_SIZE) * CHUNK_SIZE)),
            );
            await Promise.all(chunkStarts.map((cs) => fetchChunk(cs)));

            // Aggregate
            let totalCells = 0;
            let numericCount = 0;
            let sum = 0;
            for (let r = startRow; r <= endRow; r++) {
                const source = visibleRows ? visibleRows[r] : r;
                const row = rowCacheRef.current.get(source);
                if (!row) continue;
                for (let c = startCol; c <= endCol; c++) {
                    const val = row[c];
                    totalCells++;
                    if (val === undefined || val === null || String(val).toUpperCase() === "NULL") {
                        continue;
                    }
                    const num = Number(val);
                    if (!isNaN(num)) {
                        numericCount++;
                        sum += num;
                    }
                }
            }
            const selectedRows = endRow - startRow + 1;
            const numeric = numericCount > 0;
            const avg = numeric ? sum / numericCount : undefined;
            if (!cancelled)
                setSelSummary({
                    rows: Math.max(0, selectedRows),
                    cells: totalCells,
                    numeric,
                    sum: numeric ? sum : undefined,
                    avg: numeric && isFinite(avg!) ? avg : undefined,
                });
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [gridSelection, viewRows, rowCount, fetchChunk]);

    // Load all rows for small datasets to enable in-memory sort/filter
    const ensureAllFetched = useCallback(
        async (force = false) => {
            if ((rowCount > inMemoryThreshold && !force) || fullData) return;
            const all: string[][] = new Array(rowCount);
            const chunk = CHUNK_SIZE;
            for (let start = 0; start < rowCount; start += chunk) {
                await fetchChunk(start);
                for (let r = start; r < Math.min(start + chunk, rowCount); r++) {
                    const row = rowCacheRef.current.get(r);
                    if (row) all[r] = row;
                }
            }
            setFullData(all);
            setViewRows(all.map((_, i) => i));
        },
        [rowCount, inMemoryThreshold, fullData, fetchChunk],
    );

    // Apply filter/sort to fullData to update viewRows
    const recomputeView = useCallback(() => {
        if (!fullData) return;
        let idxs = fullData.map((_, i) => i);
        // Filtering
        if (filters.size > 0) {
            idxs = idxs.filter((r) => {
                const row = fullData[r];
                if (!row) return false;
                for (const [c, f] of filters.entries()) {
                    const q = f?.value ?? "";
                    if (!q) continue;
                    const val = row[c] ?? "";
                    if (!String(val).toLowerCase().includes(q.toLowerCase())) return false;
                }
                return true;
            });
        }
        // Sorting
        if (sortState.dir && sortState.col >= 0) {
            const c = sortState.col;
            const dir = sortState.dir === "asc" ? 1 : -1;
            idxs.sort((a, b) => {
                const va = fullData[a]?.[c] ?? "";
                const vb = fullData[b]?.[c] ?? "";
                const numa = Number(va);
                const numb = Number(vb);
                if (!isNaN(numa) && !isNaN(numb)) return (numa - numb) * dir;
                return String(va).localeCompare(String(vb)) * dir;
            });
        }
        setViewRows(idxs);
        setVersion((v) => v + 1);
    }, [filters, sortState, fullData]);

    useEffect(() => {
        if (fullData) recomputeView();
    }, [filters, sortState, fullData, recomputeView]);

    const getSlickSelection = useCallback((): qr.ISlickRange[] | undefined => {
        const current = gridSelection?.current?.range;
        if (!current) return undefined;
        const fromRow = current.y;
        const toRow = current.y + current.height - 1;
        const fromCell = current.x;
        const toCell = current.x + current.width - 1;
        return [
            {
                fromCell,
                toCell,
                fromRow,
                toRow,
            },
        ];
    }, [gridSelection]);

    const handleMenuAction = useCallback(
        async (action: GridContextMenuAction) => {
            if (!context) return;
            switch (action) {
                case GridContextMenuAction.SelectAll: {
                    // Visual select all using Glide selection model
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-var-requires
                        const gdg = require("@glideapps/glide-data-grid");
                        const CompactSelection = gdg.CompactSelection;
                        setGridSelection({
                            columns: CompactSelection.fromSingleSelection({
                                start: 0,
                                end: Math.max(cols.length - 1, 0),
                            }),
                            rows: CompactSelection.fromSingleSelection({
                                start: 0,
                                end: Math.max((viewRows.length || rowCount) - 1, 0),
                            }),
                            current: {
                                cell: [0, 0],
                                range: {
                                    x: 0,
                                    y: 0,
                                    width: Math.max(cols.length, 0),
                                    height: Math.max(viewRows.length || rowCount, 0),
                                },
                                rangeStack: [],
                            },
                        });
                    } catch {}
                    break;
                }
                case GridContextMenuAction.CopySelection: {
                    const sel = getSlickSelection();
                    await context.extensionRpc.sendRequest(qr.CopySelectionRequest.type, {
                        uri,
                        batchId: resultSetSummary.batchId,
                        resultId: resultSetSummary.id,
                        selection: sel ?? [
                            {
                                fromCell: 0,
                                toCell: Math.max(cols.length - 1, 0),
                                fromRow: 0,
                                toRow: Math.max(rowCount - 1, 0),
                            },
                        ],
                    });
                    break;
                }
                case GridContextMenuAction.CopyWithHeaders: {
                    const sel = getSlickSelection();
                    await context.extensionRpc.sendRequest(qr.CopyWithHeadersRequest.type, {
                        uri,
                        batchId: resultSetSummary.batchId,
                        resultId: resultSetSummary.id,
                        selection: sel ?? [
                            {
                                fromCell: 0,
                                toCell: Math.max(cols.length - 1, 0),
                                fromRow: 0,
                                toRow: Math.max(rowCount - 1, 0),
                            },
                        ],
                    });
                    break;
                }
                case GridContextMenuAction.CopyHeaders: {
                    const sel = getSlickSelection();
                    await context.extensionRpc.sendRequest(qr.CopyHeadersRequest.type, {
                        uri,
                        batchId: resultSetSummary.batchId,
                        resultId: resultSetSummary.id,
                        selection: sel ?? [
                            {
                                fromCell: 0,
                                toCell: Math.max(cols.length - 1, 0),
                                fromRow: 0,
                                toRow: 0,
                            },
                        ],
                    });
                    break;
                }
                case GridContextMenuAction.CopyAsCsv: {
                    const sel = getSlickSelection();
                    await context.extensionRpc.sendRequest(qr.CopyAsCsvRequest.type, {
                        uri,
                        batchId: resultSetSummary.batchId,
                        resultId: resultSetSummary.id,
                        selection: sel ?? [
                            {
                                fromCell: 0,
                                toCell: Math.max(cols.length - 1, 0),
                                fromRow: 0,
                                toRow: Math.max(rowCount - 1, 0),
                            },
                        ],
                        includeHeaders: true,
                    });
                    break;
                }
                case GridContextMenuAction.CopyAsJson: {
                    const sel = getSlickSelection();
                    await context.extensionRpc.sendRequest(qr.CopyAsJsonRequest.type, {
                        uri,
                        batchId: resultSetSummary.batchId,
                        resultId: resultSetSummary.id,
                        selection: sel ?? [
                            {
                                fromCell: 0,
                                toCell: Math.max(cols.length - 1, 0),
                                fromRow: 0,
                                toRow: Math.max(rowCount - 1, 0),
                            },
                        ],
                        includeHeaders: true,
                    });
                    break;
                }
                default:
                    break;
            }
        },
        [
            cols.length,
            context,
            getSlickSelection,
            resultSetSummary.batchId,
            resultSetSummary.id,
            rowCount,
            uri,
        ],
    );

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                ...style,
            }}
            ref={wrapperRef}
            tabIndex={0}
            onContextMenu={(e) => {
                // If header flyout is open, suppress the grid context menu
                if (headerMenu.open) return;
                e.preventDefault();
                e.stopPropagation();
                if (!context) return;
                const margin = 8;
                const estimated = 260;
                const x = Math.min(Math.max(e.pageX, margin), window.innerWidth - estimated);
                const y = Math.min(Math.max(e.pageY, margin), window.innerHeight - estimated);
                context.showGridContextMenu(x, y, async (action) => {
                    if (action === GridContextMenuAction.SelectAll) {
                        // Mirror Ctrl/Cmd+A
                        try {
                            const gdg = require("@glideapps/glide-data-grid");
                            const CompactSelection = gdg.CompactSelection;
                            setGridSelection({
                                columns: CompactSelection.fromSingleSelection({
                                    start: 0,
                                    end: Math.max(cols.length - 1, 0),
                                }),
                                rows: CompactSelection.fromSingleSelection({
                                    start: 0,
                                    end: Math.max((viewRows.length || rowCount) - 1, 0),
                                }),
                                current: {
                                    cell: [0, 0],
                                    range: {
                                        x: 0,
                                        y: 0,
                                        width: Math.max(cols.length, 0),
                                        height: Math.max(viewRows.length || rowCount, 0),
                                    },
                                    rangeStack: [],
                                },
                            });
                        } catch {}
                    } else {
                        await handleMenuAction(action);
                    }
                    context.hideGridContextMenu();
                });
            }}
            onKeyDownCapture={(e) => {
                const isAccel = e.metaKey || e.ctrlKey;
                const key = e.key.toLowerCase();
                if (!isAccel) return;
                if (key === "a") {
                    e.preventDefault();
                    // Programmatically select all in the grid (visual)
                    try {
                        // Lazy import to avoid type hassles
                        // eslint-disable-next-line @typescript-eslint/no-var-requires
                        const gdg = require("@glideapps/glide-data-grid");
                        const CompactSelection = gdg.CompactSelection;
                        setGridSelection({
                            columns: CompactSelection.fromSingleSelection({
                                start: 0,
                                end: Math.max(cols.length - 1, 0),
                            }),
                            rows: CompactSelection.fromSingleSelection({
                                start: 0,
                                end: Math.max((viewRows.length || rowCount) - 1, 0),
                            }),
                            current: {
                                cell: [0, 0],
                                range: {
                                    x: 0,
                                    y: 0,
                                    width: Math.max(cols.length, 0),
                                    height: Math.max(viewRows.length || rowCount, 0),
                                },
                                rangeStack: [],
                            },
                        });
                    } catch {
                        // ignore if library shape changes; no-op fallback
                    }
                } else if (key === "c" && e.shiftKey) {
                    e.preventDefault();
                    void handleMenuAction(GridContextMenuAction.CopyWithHeaders);
                } else if (key === "c") {
                    e.preventDefault();
                    void handleMenuAction(GridContextMenuAction.CopySelection);
                }
            }}>
            <div style={{ flex: "1 1 auto", minHeight: 0 }}>
                {(() => {
                    const headerHandlers: any = {
                        onHeaderClicked: async (col: number, ev: any) => {
                            const rect = sortIconRectsRef.current.get(col);
                            if (!rect) return;
                            const x = ev?.localEventX ?? 0;
                            const y = ev?.localEventY ?? 0;
                            const hit =
                                x >= rect.x &&
                                x <= rect.x + rect.w &&
                                y >= rect.y &&
                                y <= rect.y + rect.h;
                            if (!hit) return;
                            if (rowCount > inMemoryThreshold) {
                                await context?.extensionRpc.sendRequest(
                                    qr.ShowFilterDisabledMessageRequest.type,
                                    {} as any,
                                );
                                return;
                            }
                            await ensureAllFetched();
                            const dataCol = col - 1;
                            setSortState((s) => {
                                let next: "asc" | "desc" | null = "asc";
                                if (s.col === dataCol) {
                                    next =
                                        s.dir === "asc" ? "desc" : s.dir === "desc" ? null : "asc";
                                }
                                return { col: dataCol, dir: next };
                            });
                        },
                        onHeaderMenuClick: (col: number, rect: any) => {
                            // Toggle if the same menu is already open
                            if (headerMenu.open && headerMenu.col === col) {
                                setHeaderMenu((m) => ({ ...m, open: false }));
                                return;
                            }
                            const margin = 8;
                            const x = Math.min(Math.max(rect.x, margin), window.innerWidth - 260);
                            const y = Math.min(
                                Math.max(rect.y + rect.height, margin),
                                window.innerHeight - 260,
                            );
                            setHeaderMenu({ open: true, x, y, col });
                        },
                        onHeaderContextMenu: async (col: number, ev: any) => {
                            ev?.preventDefault?.();
                            ev?.stopPropagation?.();
                            // open flyout at cursor
                            const margin = 8;
                            const estimated = 260;
                            const x = Math.min(
                                Math.max(ev?.pageX ?? 0, margin),
                                window.innerWidth - estimated,
                            );
                            const y = Math.min(
                                Math.max(ev?.pageY ?? 0, margin),
                                window.innerHeight - estimated,
                            );
                            // Toggle if the same menu is already open
                            if (headerMenu.open && headerMenu.col === col) {
                                setHeaderMenu((m) => ({ ...m, open: false }));
                                return;
                            }
                            setHeaderMenu({ open: true, x, y, col });
                        },
                    };
                    // Zebra striping for readability
                    const parse = (c: string): [number, number, number] | undefined => {
                        const hex = c.match(/^#([0-9a-f]{6})$/i);
                        if (hex) {
                            const n = parseInt(hex[1], 16);
                            return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
                        }
                        const rgb = c.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
                        if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
                        return undefined;
                    };
                    const toHex = (r: number, g: number, b: number) =>
                        `#${[r, g, b]
                            .map((v) => {
                                const s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
                                return s.length === 1 ? `0${s}` : s;
                            })
                            .join("")}`;
                    const blend = (
                        b: [number, number, number],
                        o: [number, number, number],
                        a: number,
                    ) =>
                        [
                            (1 - a) * b[0] + a * o[0],
                            (1 - a) * b[1] + a * o[1],
                            (1 - a) * b[2] + a * o[2],
                        ] as [number, number, number];
                    const css = getComputedStyle(document.documentElement);
                    const baseStr =
                        css.getPropertyValue("--vscode-editor-background").trim() || "#1e1e1e";
                    const fgStr =
                        css.getPropertyValue("--vscode-editor-foreground").trim() || "#cccccc";
                    const selStr =
                        css.getPropertyValue("--vscode-editor-selectionBackground").trim() ||
                        "#264f78";
                    const base = parse(baseStr) ?? [30, 30, 30];
                    const fg = parse(fgStr) ?? [204, 204, 204];
                    const sel = parse(selStr) ?? [38, 79, 120];
                    const overlay = blend(fg, sel, 0.25);
                    const alt = blend(base, overlay, 0.06);
                    const zebraEven = toHex(alt[0], alt[1], alt[2]);
                    const getRowThemeOverride = (row: number) => {
                        if (row % 2 === 0) {
                            return { bgCell: zebraEven } as any;
                        }
                        return undefined;
                    };

                    // Custom sort icons in header and click area near menu
                    const headerIcons = {
                        sortUp: ({ fgColor }: { fgColor: string }) =>
                            `<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg"><path d=\"M10 5l4 6H6z\" fill=\"${fgColor}\"/></svg>`,
                        sortDown: ({ fgColor }: { fgColor: string }) =>
                            `<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg"><path d=\"M10 15l4-6H6z\" fill=\"${fgColor}\"/></svg>`,
                        sortBoth: ({ fgColor }: { fgColor: string }) =>
                            `<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg"><path d=\"M10 5l3 4H7zM10 15l3-4H7z\" fill=\"${fgColor}\"/></svg>`,
                    } as Record<string, (p: { fgColor: string; bgColor: string }) => string>;

                    const drawHeader = (args: any, drawContent: () => void) => {
                        const { ctx, theme, spriteManager, menuBounds, columnIndex } = args;
                        drawContent();
                        if (columnIndex < 0) return false;
                        let sprite = "sortBoth";
                        if (sortState.col === columnIndex - 1) {
                            sprite =
                                sortState.dir === "asc"
                                    ? "sortUp"
                                    : sortState.dir === "desc"
                                      ? "sortDown"
                                      : "sortBoth";
                        }
                        const size = (theme as any).headerIconSize ?? 16;
                        const gap = 4;
                        const x = menuBounds.x - size - gap;
                        const y = menuBounds.y + (menuBounds.height - size) / 2;
                        sortIconRectsRef.current.set(columnIndex, { x, y, w: size, h: size });
                        spriteManager.drawSprite(sprite, "normal", ctx, x, y, size, theme);
                        return false;
                    };

                    // Column resize handlers
                    const onColumnResize = (_col: any, newSize: number, columnIndex: number) => {
                        setCols((prev) =>
                            prev.map((c, i) => (i === columnIndex ? { ...c, width: newSize } : c)),
                        );
                    };
                    const onColumnResizeEnd = async (
                        _col: any,
                        _newSize: number,
                        _columnIndex: number,
                    ) => {
                        try {
                            const widths = (cols || [])
                                .map((c) => (typeof c.width === "number" ? c.width : 0))
                                .slice(1); // exclude row number column
                            await context?.extensionRpc.sendRequest(
                                qr.SetColumnWidthsRequest.type,
                                {
                                    uri,
                                    columnWidths: widths,
                                },
                            );
                        } catch {
                            // ignore persistence errors
                        }
                    };

                    return (
                        <DataEditor
                            smoothScrollX
                            smoothScrollY
                            rowMarkers={"number"}
                            columns={cols}
                            rows={viewRows.length > 0 ? viewRows.length : rowCount}
                            getCellContent={getCellContent}
                            gridSelection={gridSelection}
                            onGridSelectionChange={setGridSelection}
                            onCellActivated={async (cell: any) => {
                                // Open quick overlay on double click / activation
                                const [col, row] = cell as Item;
                                const sourceRow = viewRows.length > 0 ? viewRows[row] : row;
                                await fetchChunk(Math.floor(sourceRow / CHUNK_SIZE) * CHUNK_SIZE);
                                const cached = rowCacheRef.current.get(sourceRow);
                                const dataColIndex = col; // map to columnInfo index
                                const value = cached?.[dataColIndex] ?? "";
                                const colInfo = resultSetSummary?.columnInfo?.[dataColIndex];
                                const title = colInfo?.columnName ?? "Cell";
                                const text = String(value ?? "");
                                // Prefer metadata flags if available
                                const metaLang = colInfo?.isJson
                                    ? "json"
                                    : colInfo?.isXml
                                      ? "xml"
                                      : undefined;
                                let lang = metaLang;
                                if (!lang) {
                                    const looksJson = (() => {
                                        try {
                                            JSON.parse(text);
                                            return true;
                                        } catch {
                                            return /^\s*[\[{]/.test(text) && /[\]}]\s*$/.test(text);
                                        }
                                    })();
                                    const looksXml = /^\s*<[^>]+>/.test(text);
                                    lang = looksJson ? "json" : looksXml ? "xml" : "plaintext";
                                }
                                setOverlay({ open: true, content: text, title, lang });
                            }}
                            rowHeight={24}
                            theme={compactTheme as any}
                            freezeColumns={frozenCols as any}
                            getRowThemeOverride={getRowThemeOverride as any}
                            headerIcons={headerIcons as any}
                            drawHeader={drawHeader as any}
                            onColumnResize={onColumnResize as any}
                            onColumnResizeEnd={onColumnResizeEnd as any}
                            {...headerHandlers}
                        />
                    );
                })()}
            </div>
            {/* Footer summary */}
            <div
                style={{
                    borderTop: `1px solid ${getComputedStyle(document.documentElement).getPropertyValue("--vscode-editorWidget-border").trim() || "#333"}`,
                    marginTop: 0,
                    padding: "6px 8px",
                    display: "flex",
                    gap: 12,
                    fontSize: 12,
                    color:
                        getComputedStyle(document.documentElement)
                            .getPropertyValue("--vscode-editor-foreground")
                            .trim() || undefined,
                    background:
                        getComputedStyle(document.documentElement)
                            .getPropertyValue("--vscode-editorWidget-background")
                            .trim() || "#2b2b2b",
                }}>
                <span>Rows: {rowCount}</span>
                <span>Selected rows: {selSummary.rows}</span>
                <span>Cells: {selSummary.cells}</span>
                {selSummary.numeric && (
                    <>
                        <span>Sum: {selSummary.sum?.toLocaleString?.() ?? selSummary.sum}</span>
                        <span>
                            Avg:{" "}
                            {selSummary.avg !== undefined
                                ? (Number(selSummary.avg).toLocaleString?.() ?? selSummary.avg)
                                : ""}
                        </span>
                    </>
                )}
            </div>
            {overlay.open && (
                <div
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setOverlay({ open: false, content: "" })}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") setOverlay({ open: false, content: "" });
                    }}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.35)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 100001,
                    }}>
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "min(900px, 80vw)",
                            height: "min(70vh, 700px)",
                            background:
                                getComputedStyle(document.documentElement).getPropertyValue(
                                    "--vscode-editorWidget-background",
                                ) || "#2b2b2b",
                            color:
                                getComputedStyle(document.documentElement).getPropertyValue(
                                    "--vscode-editor-foreground",
                                ) || "#ccc",
                            border:
                                "1px solid " +
                                (getComputedStyle(document.documentElement).getPropertyValue(
                                    "--vscode-editorWidget-border",
                                ) || "#333"),
                            borderRadius: 6,
                            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                            display: "flex",
                            flexDirection: "column",
                        }}>
                        <div style={{ padding: "8px 12px", display: "flex", alignItems: "center" }}>
                            <Text weight="semibold">{overlay.title} – Cell Preview</Text>
                            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                                <Button
                                    appearance="secondary"
                                    onClick={() => {
                                        void navigator.clipboard?.writeText(overlay.content ?? "");
                                    }}>
                                    Copy
                                </Button>
                                <Button
                                    appearance="primary"
                                    onClick={() => setOverlay({ open: false, content: "" })}>
                                    Close
                                </Button>
                            </div>
                        </div>
                        <div style={{ flex: 1, minHeight: 0 }}>
                            {(() => {
                                const text = overlay.content ?? "";
                                let language = overlay.lang;
                                if (!language) {
                                    const looksJson = (() => {
                                        try {
                                            JSON.parse(text);
                                            return true;
                                        } catch {
                                            return /^\s*[\[{]/.test(text) && /[\]}]\s*$/.test(text);
                                        }
                                    })();
                                    const looksXml = /^\s*<[^>]+>/.test(text);
                                    language = looksJson ? "json" : looksXml ? "xml" : "plaintext";
                                }
                                return (
                                    <Editor
                                        value={text}
                                        language={language}
                                        theme={resolveVscodeThemeType(themeKind)}
                                        options={{
                                            readOnly: true,
                                            wordWrap: "on",
                                            minimap: { enabled: false },
                                            scrollBeyondLastLine: false,
                                            lineNumbers: "on",
                                            renderWhitespace: "selection",
                                        }}
                                        height="100%"
                                    />
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}
            {headerMenu.open && (
                <div
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    style={{ position: "fixed", inset: 0, zIndex: 100000 }}
                    onClick={() => setHeaderMenu((m) => ({ ...m, open: false }))}>
                    <Menu
                        open={true}
                        positioning={{
                            target: {
                                getBoundingClientRect: () =>
                                    new DOMRect(headerMenu.x, headerMenu.y, 0, 0),
                            } as any,
                            position: "below",
                            align: "start",
                            offset: 4,
                            overflowBoundary: document.body,
                            flipBoundary: document.body,
                        }}
                        onOpenChange={(_, d) => {
                            if (!d.open) setHeaderMenu((m) => ({ ...m, open: false }));
                        }}>
                        <MenuPopover onClick={(e) => e.stopPropagation()}>
                            <MenuList>
                                <MenuItem
                                    onClick={() => {
                                        setFrozenCols(Math.max(1, headerMenu.col + 1));
                                        setHeaderMenu((m) => ({ ...m, open: false }));
                                    }}>
                                    Freeze Up To Here
                                </MenuItem>
                                <MenuItem
                                    onClick={() => {
                                        setFrozenCols(0);
                                        setHeaderMenu((m) => ({ ...m, open: false }));
                                    }}>
                                    Unfreeze Columns
                                </MenuItem>
                            </MenuList>
                            <div
                                style={{
                                    padding: 8,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 6,
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}>
                                <Field label={"Filter"} size="small">
                                    <Input
                                        appearance="outline"
                                        placeholder="Contains…"
                                        value={filters.get(headerMenu.col - 1)?.value ?? ""}
                                        onChange={(ev) => {
                                            const v = (ev.target as HTMLInputElement)?.value ?? "";
                                            setFilters((prev) => {
                                                const m = new Map(prev);
                                                m.set(headerMenu.col - 1, { value: v });
                                                return m;
                                            });
                                        }}
                                        onKeyDown={async (ev) => {
                                            if (ev.key === "Enter") {
                                                await ensureAllFetched(true);
                                                setHeaderMenu((m) => ({ ...m, open: false }));
                                            }
                                        }}
                                        style={{ width: 180 }}
                                    />
                                </Field>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <Button
                                        size="small"
                                        appearance="primary"
                                        onClick={async () => {
                                            await ensureAllFetched(true);
                                            setHeaderMenu((m) => ({ ...m, open: false }));
                                        }}>
                                        Apply
                                    </Button>
                                    <Button
                                        size="small"
                                        appearance="secondary"
                                        onClick={() => {
                                            setFilters((prev) => {
                                                const m = new Map(prev);
                                                m.delete(headerMenu.col - 1);
                                                return m;
                                            });
                                            setHeaderMenu((m) => ({ ...m, open: false }));
                                        }}>
                                        Clear
                                    </Button>
                                </div>
                            </div>
                        </MenuPopover>
                    </Menu>
                </div>
            )}
        </div>
    );
};

export default BetaResultGrid;
