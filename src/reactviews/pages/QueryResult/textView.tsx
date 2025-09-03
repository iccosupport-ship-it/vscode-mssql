/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { makeStyles } from "@fluentui/react-components";
import Editor, { OnMount } from "@monaco-editor/react";
// Note: resolveVscodeThemeType import removed for this file; theme now applied via custom theme
// (no direct use here; themeKind's type comes from hook generics)
import * as qr from "../../../sharedInterfaces/queryResult";
import { locConstants } from "../../common/locConstants";
import { QueryResultCommandsContext } from "./queryResultStateProvider";
import { useVscodeWebview2 } from "../../common/vscodeWebviewProvider2";
import { applyVSCodeThemeToMonaco } from "../../common/monacoTheme";

const MONACO_THEME_NAME = "mssql-vscode-theme";

// Module-scoped cache so content persists across component unmounts (e.g., tab switches)
type CacheEntry = {
    model: any | null;
    hasStreamed: boolean;
    signature?: string;
    text?: string; // cached text mirror to recover if model was disposed by host
    scrollTop?: number;
    scrollLeft?: number;
};
const textViewModelCache: Map<string, CacheEntry> = new Map();

const useStyles = makeStyles({
    textViewContainer: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
    },
    editorContainer: {
        width: "100%",
        height: "100%",
        flex: 1,
        minHeight: "400px",
    },
    noResults: {
        fontStyle: "italic",
        color: "var(--vscode-descriptionForeground)",
        padding: "10px",
        fontFamily: "var(--vscode-editor-font-family)",
        fontSize: "var(--vscode-editor-font-size)",
        width: "100%",
        height: "100%",
        flex: 1,
    },
});

export interface TextViewProps {
    uri?: string;
    resultSetSummaries?: { [batchId: number]: { [resultId: number]: qr.ResultSetSummary } };
    fontSettings: qr.FontSettings;
}

export const TextView: React.FC<TextViewProps> = ({ uri, resultSetSummaries, fontSettings }) => {
    const classes = useStyles();
    const context = useContext(QueryResultCommandsContext);
    const [editorReady, setEditorReady] = useState<boolean>(false);
    const { themeKind, EOL } = useVscodeWebview2<
        qr.QueryResultWebviewState,
        qr.QueryResultReducers
    >();

    // Monaco editor streaming setup
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<any>(null);
    const modelRef = useRef<any>(null);
    const runIdRef = useRef<number>(0); // cancels in-flight streaming when inputs change
    const scrollDisposableRef = useRef<any>(null);

    const beforeMount = (monaco: any) => {
        monacoRef.current = monaco;
    };

    const containerElRef = useRef<HTMLElement | null>(null);

    const onMount: OnMount = (editor, _monaco) => {
        editorRef.current = editor;
        containerElRef.current = editor?.getContainerDomNode?.() ?? null;
        // Reuse a cached model for this uri if available; else create and cache one
        const key = uri ?? "unknown";
        const cached = textViewModelCache.get(key);
        if (cached?.model && !(cached.model.isDisposed?.() ?? false)) {
            modelRef.current = cached.model;
            editor.setModel(cached.model);
        } else {
            if (!monacoRef.current) return;
            const model = monacoRef.current.editor.createModel("", "plaintext");
            modelRef.current = model;
            // If we had cached text from earlier run, restore it without refetch
            if (cached?.text) {
                model.setValue(cached.text);
            }
            textViewModelCache.set(key, {
                model,
                hasStreamed: cached?.hasStreamed ?? false,
                signature: cached?.signature,
                text: cached?.text,
                scrollTop: cached?.scrollTop,
                scrollLeft: cached?.scrollLeft,
            });
            editor.setModel(model);
        }

        editor.updateOptions({
            readOnly: true,
            renderWhitespace: "none",
            scrollBeyondLastLine: false,
            wordWrap: "off",
            maxTokenizationLineLength: 2000,
        });

        // Apply derived VS Code theme colors to Monaco
        if (monacoRef.current && typeof themeKind !== "undefined") {
            applyVSCodeThemeToMonaco(
                monacoRef.current,
                themeKind,
                MONACO_THEME_NAME,
                containerElRef.current,
            );
            // In case VS Code updates CSS vars slightly after mount, re-apply next frame
            requestAnimationFrame(() =>
                applyVSCodeThemeToMonaco(
                    monacoRef.current,
                    themeKind,
                    MONACO_THEME_NAME,
                    containerElRef.current,
                ),
            );
        }

        // Restore scroll position if we have it cached for this uri
        const postAttachCached = textViewModelCache.get(key);
        if (postAttachCached && (postAttachCached.scrollTop || postAttachCached.scrollLeft)) {
            // Delay to allow layout before applying scroll
            requestAnimationFrame(() => {
                if (typeof postAttachCached.scrollTop === "number") {
                    editor.setScrollTop(postAttachCached.scrollTop);
                }
                if (typeof postAttachCached.scrollLeft === "number") {
                    editor.setScrollLeft(postAttachCached.scrollLeft);
                }
            });
        }

        // Persist scroll position as user scrolls
        const disposable = editor.onDidScrollChange(() => {
            const entry = textViewModelCache.get(key);
            if (!entry) return;
            entry.scrollTop = editor.getScrollTop();
            entry.scrollLeft = editor.getScrollLeft();
        });
        // Save disposable to cleanup ref
        scrollDisposableRef.current = disposable;
        setEditorReady(true);
    };

    const appendChunk = useCallback((chunk: string, keepScrollAtBottom = false) => {
        const monaco = monacoRef.current;
        const model = modelRef.current;
        const editor = editorRef.current;
        if (!monaco || !model || !chunk) return;

        const lastLine = model.getLineCount();
        const lastCol = model.getLineMaxColumn(lastLine);
        model.applyEdits([
            {
                range: new monaco.Range(lastLine, lastCol, lastLine, lastCol),
                text: chunk,
                forceMoveMarkers: true,
            },
        ]);

        // Update cached text mirror
        const key = uri ?? "unknown";
        const cached = textViewModelCache.get(key);
        if (cached) {
            cached.text = (cached.text ?? "") + chunk;
        } else {
            textViewModelCache.set(key, { model, hasStreamed: false, text: chunk });
        }

        if (keepScrollAtBottom && editor) {
            editor.revealLine(model.getLineCount(), 1);
        }
    }, []);

    useEffect(() => {
        // Re-apply Monaco theme when VS Code theme changes
        if (monacoRef.current && typeof themeKind !== "undefined") {
            // Apply with resolved CSS variable values from the editor container
            applyVSCodeThemeToMonaco(
                monacoRef.current,
                themeKind,
                MONACO_THEME_NAME,
                containerElRef.current,
            );
            // Re-apply on next frame to catch async CSS var updates
            requestAnimationFrame(() =>
                applyVSCodeThemeToMonaco(
                    monacoRef.current,
                    themeKind,
                    MONACO_THEME_NAME,
                    containerElRef.current,
                ),
            );
        }
    }, [themeKind]);

    useEffect(() => {
        // Cleanup scroll listener on unmount or uri change
        return () => {
            try {
                scrollDisposableRef.current?.dispose?.();
            } catch {
                // ignore
            }
        };
    }, [uri]);

    useEffect(() => {
        // Build a compact signature of the summaries so we can detect new results
        const computeSignature = (summaries?: {
            [batchId: number]: { [resultId: number]: qr.ResultSetSummary };
        }): string => {
            if (!summaries) return "";
            const parts: string[] = [];
            const batchIds = Object.keys(summaries)
                .map((x) => parseInt(x))
                .sort((a, b) => a - b);
            for (const b of batchIds) {
                const rs = summaries[b];
                if (!rs) continue;
                const resultIds = Object.keys(rs)
                    .map((x) => parseInt(x))
                    .sort((a, b) => a - b);
                for (const r of resultIds) {
                    const s = rs[r];
                    const cols = s?.columnInfo?.length ?? 0;
                    const colNames = (s?.columnInfo ?? [])
                        .map((c) => c?.columnName ?? "")
                        .join(",");
                    const rows = s?.rowCount ?? 0;
                    parts.push(`b:${b}|r:${r}|rows:${rows}|cols:${cols}|names:${colNames}`);
                }
            }
            return parts.join(";");
        };

        const streamTextView = async (thisRunId: number) => {
            // Ensure we have a model ready
            const model = modelRef.current;
            if (model) {
                model.setValue("");
            }

            if (!uri || !resultSetSummaries || Object.keys(resultSetSummaries).length === 0) {
                appendChunk(`${locConstants.queryResult.noResultsToDisplay}${EOL}`);
                return;
            }

            try {
                // Update cache entry to reflect this signature
                const key = uri ?? "unknown";
                const sig = computeSignature(resultSetSummaries);
                const cached = textViewModelCache.get(key);
                if (cached) cached.signature = sig;
                for (const batchIdStr of Object.keys(resultSetSummaries)) {
                    if (thisRunId !== runIdRef.current) return; // cancelled
                    const batchId = parseInt(batchIdStr);
                    const batch = resultSetSummaries[batchId];
                    if (!batch) continue;

                    for (const resultIdStr of Object.keys(batch)) {
                        if (thisRunId !== runIdRef.current) return; // cancelled
                        const resultId = parseInt(resultIdStr);
                        const resultSetSummary = batch[resultId];
                        if (
                            !resultSetSummary ||
                            !resultSetSummary.columnInfo ||
                            !Array.isArray(resultSetSummary.columnInfo)
                        ) {
                            continue;
                        }

                        const columnInfo = resultSetSummary.columnInfo;
                        const columnNames = columnInfo.map((col) => col?.columnName || "");
                        // Start with header widths; we'll widen per-chunk as needed (earlier lines won't be reflowed)
                        let columnWidths = columnNames.map((name) => Math.max(name.length, 10));

                        const resultIdentifier = `${batchId}-${resultId}`;
                        appendChunk(
                            `${locConstants.queryResult.resultSet(resultIdentifier)}${EOL}` +
                                "=".repeat(40) +
                                `${EOL}${EOL}`,
                        );

                        // Print header and separator based on initial widths
                        const headerLine = columnNames
                            .map((name, index) => name.padEnd(columnWidths[index]))
                            .join("  ");
                        const separatorLine = columnWidths
                            .map((width) => "-".repeat(width))
                            .join("  ");
                        appendChunk(`${headerLine}${EOL}${separatorLine}${EOL}`);

                        // Stream rows in chunks (default 5000)
                        const total = resultSetSummary.rowCount || 0;
                        const CHUNK = 5000;
                        for (let start = 0; start < total; start += CHUNK) {
                            if (thisRunId !== runIdRef.current) return; // cancelled
                            const count = Math.min(CHUNK, total - start);
                            const response = await context?.extensionRpc.sendRequest(
                                qr.GetRowsRequest.type,
                                {
                                    uri,
                                    batchId,
                                    resultId,
                                    rowStart: start,
                                    numberOfRows: count,
                                },
                            );

                            if (thisRunId !== runIdRef.current) return; // cancelled
                            if (response && response.rows && response.rows.length) {
                                // Widen widths based on this chunk (later lines only)
                                for (const row of response.rows) {
                                    row.forEach((cell, index) => {
                                        const displayValue = cell.isNull
                                            ? "NULL"
                                            : cell.displayValue || "";
                                        columnWidths[index] = Math.max(
                                            columnWidths[index],
                                            displayValue.toString().length,
                                        );
                                    });
                                }

                                // Format chunk using current widths and append once
                                const lines: string[] = [];
                                for (const row of response.rows) {
                                    const line = row
                                        .map((cell, index) => {
                                            const displayValue = cell.isNull
                                                ? "NULL"
                                                : cell.displayValue || "";
                                            return displayValue
                                                .toString()
                                                .padEnd(columnWidths[index]);
                                        })
                                        .join("  ");
                                    lines.push(line);
                                }
                                appendChunk(lines.join(EOL) + EOL);
                            }
                        }

                        // Footer rows affected
                        appendChunk(
                            `(${locConstants.queryResult.rowsAffected(resultSetSummary.rowCount)})${EOL}${EOL}`,
                        );
                    }
                }
                // Mark as streamed so tab switches don't refetch
                const entry = textViewModelCache.get(uri ?? "unknown");
                if (entry) entry.hasStreamed = true;
            } catch (error) {
                context?.log(`Error generating streaming text view: ${error}`, "error");
                appendChunk(`${locConstants.queryResult.errorGeneratingTextView}${EOL}`);
            }
        };

        // New run: bump id and start streaming
        if (!editorReady || !modelRef.current) {
            return; // wait until editor/model is ready
        }
        const key = uri ?? "unknown";
        const sig = computeSignature(resultSetSummaries);
        const cached = textViewModelCache.get(key);

        // If we have already streamed for this exact signature, re-use model and skip fetching
        if (cached?.hasStreamed && cached.signature === sig) {
            let m = cached.model;
            if (!m || (m.isDisposed?.() ?? false)) {
                // Recreate model and restore text without refetching
                if (monacoRef.current) {
                    m = monacoRef.current.editor.createModel(cached.text ?? "", "plaintext");
                    cached.model = m;
                }
            }
            if (m && editorRef.current?.getModel() !== m) {
                editorRef.current?.setModel(m);
            }
            return;
        }

        // Otherwise, reset model and stream fresh
        runIdRef.current += 1;
        const thisRunId = runIdRef.current;
        if (cached) {
            cached.hasStreamed = false;
            cached.signature = sig;
        } else {
            // Ensure we have an entry for this key if missing
            if (modelRef.current) {
                textViewModelCache.set(key, {
                    model: modelRef.current,
                    hasStreamed: false,
                    signature: sig,
                });
            }
        }
        void streamTextView(thisRunId);
        return () => {
            // cancel on dependency change by bumping runId; effect cleanup confirms cancellation via checks above
            runIdRef.current += 1;
        };
    }, [uri, resultSetSummaries, EOL, appendChunk, context, editorReady]);

    return (
        <div className={classes.textViewContainer}>
            <div className={classes.editorContainer}>
                <Editor
                    width="100%"
                    height="100%"
                    defaultLanguage="plaintext"
                    theme={MONACO_THEME_NAME}
                    beforeMount={beforeMount}
                    onMount={onMount}
                    options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        wordWrap: "off",
                        fontFamily: fontSettings.fontFamily || "var(--vscode-editor-font-family)",
                        fontSize: fontSettings.fontSize || 12,
                        lineNumbers: "off",
                        glyphMargin: false,
                        folding: false,
                        lineDecorationsWidth: 0,
                        lineNumbersMinChars: 0,
                        renderLineHighlight: "none",
                        scrollbar: {
                            vertical: "auto",
                            horizontal: "auto",
                        },
                        automaticLayout: true,
                    }}
                />
            </div>
        </div>
    );
};
