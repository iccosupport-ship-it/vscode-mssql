/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ReactNode, createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCoreRPCs2 } from "../../common/utils";
import { useVscodeWebview2 } from "../../common/vscodeWebviewProvider2";
import { useVscodeSelector } from "../../common/useVscodeSelector";
import { ExecutionPlanProvider } from "../../../sharedInterfaces/executionPlan";
import * as qr from "../../../sharedInterfaces/queryResult";
import { CoreRPCs } from "../../../sharedInterfaces/webview";
import {
    GridContextMenuAction,
    QueryResultPaneTabs,
    QueryResultReducers,
    QueryResultStateNotification,
    QueryResultStatePayload,
    QueryResultStoredState,
    QueryResultViewMode,
    QueryResultViewState,
    LoadQueryResultStateRequest,
    SortProperties,
} from "../../../sharedInterfaces/queryResult";
import { WebviewRpc } from "../../common/rpc";
import GridContextMenu from "./table/plugins/GridContextMenu";
import ColumnMenuPopup, {
    ColumnMenuPopupAnchorRect,
    FilterListItem,
    FilterValue,
} from "./table/plugins/ColumnMenuPopup";
import { TableColumnResizeDialog } from "./table/TableColumnResizeDialog";

export interface ColumnFilterPopupOptions {
    columnId: string;
    anchorRect: ColumnMenuPopupAnchorRect;
    items: FilterListItem[];
    initialSelected: FilterValue[];
    onApply: (selected: FilterValue[]) => Promise<void>;
    onClearSort: () => Promise<void>;
    onClear: () => Promise<void>;
    onDismiss: () => void;
    onSortAscending: () => Promise<void>;
    onSortDescending: () => Promise<void>;
    currentSort: SortProperties;
    onResize: () => void;
}

/**
 * Options for opening the resize column dialog
 */
const createEmptyStoredState = (): QueryResultStoredState => ({
    resultSetSummaries: {},
    messages: [],
    tabStates: {
        resultPaneTab: QueryResultPaneTabs.Messages,
    },
    isExecutionPlan: false,
    selection: undefined,
    executionPlanState: {
        executionPlanGraphs: [],
        totalCost: 0,
        loadState: undefined,
        xmlPlans: {},
    },
    fontSettings: {},
    autoSizeColumns: undefined,
    inMemoryDataProcessingThreshold: undefined,
    initializationError: undefined,
    selectionSummary: undefined,
});

const mergeResultSetSummaries = (
    current: Record<number, Record<number, qr.ResultSetSummary>>,
    patch?: Record<number, Record<number, qr.ResultSetSummary>>,
) => {
    if (!patch) {
        return current;
    }
    const next = { ...current };
    for (const batchId of Object.keys(patch)) {
        next[Number(batchId)] = {
            ...(current[Number(batchId)] ?? {}),
            ...patch[Number(batchId)],
        };
    }
    return next;
};

const mergeStoredState = (
    current: QueryResultStoredState,
    patch: Partial<QueryResultStoredState>,
): QueryResultStoredState => ({
    ...current,
    ...patch,
    resultSetSummaries: mergeResultSetSummaries(
        current.resultSetSummaries,
        patch.resultSetSummaries,
    ),
    messages: patch.messages ?? current.messages,
    tabStates: patch.tabStates ? { ...current.tabStates, ...patch.tabStates } : current.tabStates,
    executionPlanState: patch.executionPlanState
        ? { ...current.executionPlanState, ...patch.executionPlanState }
        : current.executionPlanState,
    fontSettings: patch.fontSettings
        ? { ...current.fontSettings, ...patch.fontSettings }
        : current.fontSettings,
});

type ResizeColumnDialogState = {
    open: boolean;
    columnId: string;
    columnName: string;
    initialWidth: number;
    gridId: string;
    onSubmit: (width: number) => Promise<void> | void;
    onDismiss: () => void;
};

export interface QueryResultReactProvider
    extends Omit<ExecutionPlanProvider, "getExecutionPlan">,
        CoreRPCs {
    extensionRpc: WebviewRpc<QueryResultReducers>;
    setResultTab: (tabId: QueryResultPaneTabs) => void;
    setResultViewMode: (viewMode: QueryResultViewMode) => void;
    // Grid context menu control
    showGridContextMenu: (
        x: number,
        y: number,
        onAction: (action: GridContextMenuAction) => void | Promise<void>,
    ) => void;
    hideGridContextMenu: () => void;
    showColumnFilterPopup: (options: ColumnFilterPopupOptions) => void;
    hideColumnMenuPopup: () => void;
    /**
     * Gets the execution plan graph from the provider for a result set
     * @param uri the uri of the query result state this request is associated with
     */
    getExecutionPlan(uri: string): void;

    /**
     * Opens a file of type with with specified content
     * @param content the content of the file
     * @param type the type of file to open
     */
    openFileThroughLink(content: string, type: string): void;
    /**
     * Opens the resize column dialog
     * @param options options for the resize dialog
     * @returns void
     */
    openResizeDialog: (options: Partial<ResizeColumnDialogState>) => void;
}

export const QueryResultStateContext = createContext<qr.QueryResultWebviewState | undefined>(
    undefined,
);

export const QueryResultCommandsContext = createContext<QueryResultReactProvider | undefined>(
    undefined,
);

interface QueryResultProviderProps {
    children: ReactNode;
}

const QueryResultStateProvider: React.FC<QueryResultProviderProps> = ({ children }) => {
    const { extensionRpc } = useVscodeWebview2<QueryResultViewState, QueryResultReducers>();
    const viewState = useVscodeSelector<
        qr.QueryResultViewState,
        qr.QueryResultReducers,
        qr.QueryResultViewState
    >(
        (s) => s,
        (a, b) => a?.uri === b?.uri && a?.title === b?.title,
    );

    const [storedState, setStoredState] =
        useState<QueryResultStoredState>(createEmptyStoredState());
    const currentUriRef = useRef<string | undefined>();

    // Grid context menu state
    const [menuState, setMenuState] = useState<{
        open: boolean;
        x: number;
        y: number;
        onAction?: (action: GridContextMenuAction) => void | Promise<void>;
    }>({ open: false, x: 0, y: 0 });

    const [filterPopupState, setFilterPopupState] = useState<ColumnFilterPopupOptions | undefined>(
        undefined,
    );

    const [resizeDialogState, setResizeDialogState] = useState<ResizeColumnDialogState>({
        open: false,
        columnId: "",
        columnName: "",
        initialWidth: 0,
        gridId: "",
        onDismiss: () => {},
        onSubmit: () => {},
    });

    useEffect(() => {
        let disposed = false;
        async function loadState() {
            if (!viewState?.uri) {
                if (!disposed) {
                    setStoredState(createEmptyStoredState());
                }
                return;
            }
            try {
                const response = await extensionRpc.sendRequest(LoadQueryResultStateRequest.type, {
                    uri: viewState.uri,
                });
                if (!disposed) {
                    setStoredState(response ?? createEmptyStoredState());
                }
            } catch (error) {
                console.error("Failed to load query result state", error);
                if (!disposed) {
                    setStoredState(createEmptyStoredState());
                }
            }
        }
        void loadState();
        return () => {
            disposed = true;
        };
    }, [extensionRpc, viewState?.uri]);

    useEffect(() => {
        currentUriRef.current = viewState?.uri;
    }, [viewState?.uri]);

    useEffect(() => {
        const handler = (payload: QueryResultStatePayload) => {
            if (!currentUriRef.current || payload.uri !== currentUriRef.current) {
                return;
            }
            setStoredState((prev) => mergeStoredState(prev, payload.state));
        };
        extensionRpc.onNotification(QueryResultStateNotification.type, handler);
    }, [extensionRpc]);

    const hideFilterPopup = useCallback(() => {
        setFilterPopupState((state) => {
            if (state?.onDismiss) {
                state.onDismiss();
            }
            return undefined;
        });
    }, []);

    const hideContextMenu = useCallback(() => {
        setMenuState((s) => (s.open ? { ...s, open: false } : s));
    }, []);

    const commands = useMemo<QueryResultReactProvider>(
        () => ({
            extensionRpc,
            ...getCoreRPCs2<QueryResultReducers>(extensionRpc),
            setResultTab: (tabId: QueryResultPaneTabs) => {
                extensionRpc.action("setResultTab", { tabId });
            },
            setResultViewMode: (viewMode: QueryResultViewMode) => {
                extensionRpc.action("setResultViewMode", { viewMode });
            },

            // Grid context menu API
            showGridContextMenu: (x: number, y: number, onAction) => {
                hideFilterPopup();
                setMenuState({ open: true, x, y, onAction });
            },
            hideGridContextMenu: () => {
                setMenuState((s) => ({ ...s, open: false }));
            },
            showColumnFilterPopup: (options: ColumnFilterPopupOptions) => {
                setMenuState((s) => (s.open ? { ...s, open: false } : s));
                setFilterPopupState((state) => {
                    state?.onDismiss?.();
                    return { ...options };
                });
            },
            hideColumnMenuPopup: hideFilterPopup,

            openFileThroughLink: (content: string, type: string) => {
                extensionRpc.action("openFileThroughLink", { content, type });
            },

            // Execution Plan commands

            /**
             * Gets the execution plan for a specific query result
             * @param uri the uri of the query result state this request is associated with
             */
            getExecutionPlan: (uri: string) => {
                extensionRpc.action("getExecutionPlan", { uri });
            },
            /**
             * Saves the execution plan for a specific query result
             * @param sqlPlanContent the content of the SQL plan to save
             */
            saveExecutionPlan: (sqlPlanContent: string) => {
                extensionRpc.action("saveExecutionPlan", { sqlPlanContent });
            },
            /**
             * Shows the XML representation of the execution plan for a specific query result
             * @param sqlPlanContent the content of the SQL plan to show
             */
            showPlanXml: (sqlPlanContent: string) => {
                extensionRpc.action("showPlanXml", { sqlPlanContent });
            },
            /**
             * Shows the query for a specific query result
             * @param query the query to show
             */
            showQuery: (query: string) => {
                extensionRpc.action("showQuery", { query });
            },
            /**
             * Updates the total cost for a specific query result
             * @param addedCost the cost to add to the total
             */
            updateTotalCost: (addedCost: number) => {
                extensionRpc.action("updateTotalCost", { addedCost });
            },
            openResizeDialog: (options: Partial<ResizeColumnDialogState>) => {
                setResizeDialogState((state) => ({
                    ...state,
                    ...options,
                    open: true,
                }));
            },
        }),
        [extensionRpc, hideFilterPopup],
    );

    const combinedState = useMemo<qr.QueryResultWebviewState>(
        () => ({
            ...storedState,
            uri: viewState?.uri,
            title: viewState?.title,
        }),
        [storedState, viewState],
    );

    // Close context menu when focus leaves the webview or it becomes hidden
    useEffect(() => {
        const closeOverlays = () => {
            hideContextMenu();
            hideFilterPopup();
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                closeOverlays();
            }
        };
        window.addEventListener("blur", closeOverlays);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            window.removeEventListener("blur", closeOverlays);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [hideFilterPopup]);
    return (
        <QueryResultCommandsContext.Provider value={commands}>
            <QueryResultStateContext.Provider value={combinedState}>
                {children}
                {menuState.open && (
                    <GridContextMenu
                        x={menuState.x}
                        y={menuState.y}
                        open={menuState.open}
                        onAction={async (action) => {
                            await menuState.onAction?.(action);
                            setMenuState((s) => ({ ...s, open: false }));
                        }}
                        onClose={() => setMenuState((s) => ({ ...s, open: false }))}
                    />
                )}
                {filterPopupState && (
                    <ColumnMenuPopup
                        anchorRect={filterPopupState.anchorRect}
                        items={filterPopupState.items}
                        initialSelected={filterPopupState.initialSelected}
                        onApply={async (selected) => {
                            await filterPopupState.onApply(selected);
                            hideFilterPopup();
                        }}
                        onClear={async () => {
                            await filterPopupState.onClear();
                            hideFilterPopup();
                        }}
                        onDismiss={() => {
                            hideFilterPopup();
                        }}
                        onClearSort={filterPopupState.onClearSort}
                        onSortAscending={filterPopupState.onSortAscending}
                        onSortDescending={filterPopupState.onSortDescending}
                        onResize={() => {
                            hideFilterPopup();
                            filterPopupState.onResize();
                        }}
                        currentSort={filterPopupState.currentSort}
                    />
                )}
                {resizeDialogState.open && (
                    <TableColumnResizeDialog
                        open={resizeDialogState.open}
                        columnName={resizeDialogState.columnName}
                        initialWidth={resizeDialogState.initialWidth}
                        onSubmit={async (newWidth: number) => {
                            await resizeDialogState.onSubmit(newWidth);
                            setResizeDialogState((state) => ({ ...state, open: false }));
                        }}
                        onDismiss={() => {
                            resizeDialogState.onDismiss();
                            setResizeDialogState((state) => ({ ...state, open: false }));
                        }}
                    />
                )}
            </QueryResultStateContext.Provider>
        </QueryResultCommandsContext.Provider>
    );
};

export { QueryResultStateProvider };
