/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Tab, TabList } from "@fluentui/react-tabs";
import { CounterBadge, Text, makeStyles } from "@fluentui/react-components";
import { TableDesignerContext } from "./tableDesignerStateProvider";
import { useContext } from "react";
import { DesignerMainPaneTabs } from "../../../sharedInterfaces/tableDesigner";
import { DesignerMainPaneTab } from "./designerMainPaneTab";
import * as l10n from "@vscode/l10n";

const useStyles = makeStyles({
    root: {
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
    },
    content: {
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
        flex: 1,
        gap: "10px",
        padding: "10px",
    },
    stickyTabs: {
        position: "sticky",
        top: 0,
        zIndex: 1,
        backgroundColor: "var(--vscode-editor-background)",
        paddingBottom: "4px",
    },
    title: {
        width: "400px",
        maxWidth: "100%",
        padding: "10px",
    },
    tabButtonContainer: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
    },
});

export const DesignerMainPane = () => {
    const classes = useStyles();
    const context = useContext(TableDesignerContext);
    const state = context?.state;
    if (!state) {
        return null;
    }

    const getCurrentTabIssuesCount = (tabId: string) => {
        const tabComponents = state.view?.tabs.find((tab) => tab.id === tabId)?.components;
        if (!tabComponents) {
            return 0;
        }
        if (state.issues?.length === 0) {
            return 0;
        }
        let count = 0;
        for (let i = 0; i < state?.issues!.length; i++) {
            const issue = state.issues![i];
            if (issue.propertyPath && issue.propertyPath.length > 0) {
                if (tabComponents.find((c) => c.propertyName === issue.propertyPath![0])) {
                    count++;
                }
            }
        }
        return count;
    };

    function getTableIssuesCountLabel(id: string) {
        const issues = getCurrentTabIssuesCount(id);
        if (issues === 1) {
            return l10n.t({
                message: "{0} issue",
                args: [issues],
                comment: ["{0} is the number of issues"],
            });
        } else if (issues > 1 || issues === 0) {
            return l10n.t({
                message: "{0} issues",
                args: [issues],
                comment: ["{0} is the number of issues"],
            });
        }
    }

    function getTabAriaLabel(tabId: string) {
        const issues = getCurrentTabIssuesCount(tabId);
        if (issues === 0) {
            return tabId;
        } else if (issues === 1) {
            return l10n.t({
                message: "{0} {1} issue",
                args: [tabId, issues],
                comment: ["{0} is the tab name", "{1} is the number of issues"],
            });
        } else {
            return l10n.t({
                message: "{0} {1} issues",
                args: [tabId, issues],
                comment: ["{0} is the tab name", "{1} is the number of issues"],
            });
        }
    }

    return (
        <div className={classes.root}>
            <div className={classes.stickyTabs}>
                <TabList
                    size="small"
                    selectedValue={state.tabStates?.mainPaneTab}
                    onTabSelect={(_event, data) => {
                        context.setTab(data.value as DesignerMainPaneTabs);
                        context.setPropertiesComponents(undefined);
                    }}>
                    {state.view?.tabs.map((tab) => {
                        const ariaLabel = getTabAriaLabel(tab.id);
                        return (
                            <Tab title={ariaLabel} value={tab.id} key={tab.id}>
                                <div className={classes.tabButtonContainer}>
                                    <Text>{tab.title}</Text>
                                    {getCurrentTabIssuesCount(tab.id) > 0 && (
                                        <CounterBadge
                                            color="important"
                                            size="small"
                                            title={getTableIssuesCountLabel(tab.id)}
                                            count={getCurrentTabIssuesCount(tab.id)}
                                            style={{ marginLeft: "6px" }}
                                        />
                                    )}
                                </div>
                            </Tab>
                        );
                    })}
                </TabList>
            </div>
            <div className={classes.content}>
                {state.view?.tabs.map((tab) => {
                    return (
                        <div
                            style={{
                                display: state.tabStates?.mainPaneTab === tab.id ? "" : "none",
                                width: "100%",
                                height: "100%",
                            }}
                            key={tab.id}>
                            <DesignerMainPaneTab tabId={tab.id} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
