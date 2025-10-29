/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    Button,
    Link,
    Tab,
    TabList,
    Title3,
    makeStyles,
    Text,
    Spinner,
} from "@fluentui/react-components";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { DatabaseSearch24Regular, ErrorCircle24Regular, OpenRegular } from "@fluentui/react-icons";
import * as qr from "../../../sharedInterfaces/queryResult";
import { locConstants } from "../../common/locConstants";
import { hasResultsOrMessages } from "./queryResultUtils";
import { QueryResultCommandsContext } from "./queryResultStateProvider";
import { useQueryResultSelector } from "./queryResultSelector";
import { ExecuteCommandRequest, WebviewAction } from "../../../sharedInterfaces/webview";
import { ExecutionPlanGraph } from "../../../sharedInterfaces/executionPlan";
import { getGridCount } from "./table/utils";
import { eventMatchesShortcut } from "../../common/keyboardUtils";
import { useVscodeWebview2 } from "../../common/vscodeWebviewProvider2";
import { QueryMessageTab } from "./queryMessageTab";
import { QueryExecutionPlanTab } from "./queryExecutionPlanTab";
import { QueryResultsTab } from "./queryResultsTab";

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
    const scrollablePanelRef = useRef<HTMLDivElement>(null);
    //const [messageGridHeight, setMessageGridHeight] = useState(0);

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

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const isResultsTab = tabStates?.resultPaneTab === qr.QueryResultPaneTabs.Results;
            const viewMode = getCurrentViewMode();
            const gridCount = getGridCount();
            let handled = false;
            if (
                eventMatchesShortcut(
                    event,
                    keyboardShortcuts[WebviewAction.QueryResultSwitchToResultsTab]?.keyCombination,
                )
            ) {
                if (Object.keys(resultSetSummaries ?? {}).length > 0) {
                    context.setResultTab(qr.QueryResultPaneTabs.Results);
                    handled = true;
                }
            } else if (
                eventMatchesShortcut(
                    event,
                    keyboardShortcuts[WebviewAction.QueryResultSwitchToMessagesTab]?.keyCombination,
                )
            ) {
                context.setResultTab(qr.QueryResultPaneTabs.Messages);
                handled = true;
            } else if (
                eventMatchesShortcut(
                    event,
                    keyboardShortcuts[WebviewAction.QQueryResultSwitchToQueryPlanTab]
                        ?.keyCombination,
                )
            ) {
                if (isExecutionPlan) {
                    context.setResultTab(qr.QueryResultPaneTabs.ExecutionPlan);
                    handled = true;
                }
            } else if (
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
                            title={locConstants.queryResult.resultTabTooltip(
                                keyboardShortcuts[WebviewAction.QueryResultSwitchToResultsTab]
                                    ?.label,
                            )}
                            key={qr.QueryResultPaneTabs.Results}>
                            {locConstants.queryResult.results(getGridCount(resultSetSummaries))}
                        </Tab>
                    )}
                    <Tab
                        value={qr.QueryResultPaneTabs.Messages}
                        title={locConstants.queryResult.messagesTabTooltip(
                            keyboardShortcuts[WebviewAction.QueryResultSwitchToMessagesTab]?.label,
                        )}
                        key={qr.QueryResultPaneTabs.Messages}>
                        {locConstants.queryResult.messages}
                    </Tab>
                    {Object.keys(resultSetSummaries).length > 0 && isExecutionPlan && (
                        <Tab
                            value={qr.QueryResultPaneTabs.ExecutionPlan}
                            title={locConstants.queryResult.queryPlanTooltip(
                                keyboardShortcuts[WebviewAction.QQueryResultSwitchToQueryPlanTab]
                                    ?.label,
                            )}
                            key={qr.QueryResultPaneTabs.ExecutionPlan}>
                            {`${locConstants.queryResult.queryPlan(executionPlanGraphs?.length || 0)}`}
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
                {tabStates!.resultPaneTab === qr.QueryResultPaneTabs.Results && <QueryResultsTab />}
                {tabStates!.resultPaneTab === qr.QueryResultPaneTabs.Messages && (
                    <QueryMessageTab />
                )}
                {tabStates!.resultPaneTab === qr.QueryResultPaneTabs.ExecutionPlan &&
                    isExecutionPlan && <QueryExecutionPlanTab />}
            </div>
        </div>
    );
};
