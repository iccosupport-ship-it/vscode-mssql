/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { makeStyles } from "@fluentui/react-components";
import { useContext, useMemo } from "react";
import {
    ExecutionPlanStateProvider,
    ExecutionPlanContextProps,
} from "../ExecutionPlan/executionPlanStateProvider";
import { ExecutionPlanPage } from "../ExecutionPlan/executionPlanPage";
import { QueryResultCommandsContext, QueryResultStateContext } from "./queryResultStateProvider";

const useStyles = makeStyles({
    queryResultContainer: {
        width: "100%",
        position: "relative",
        display: "flex",
        fontWeight: "normal",
    },
});

const createNoOpExecutionPlanCommands = (): ExecutionPlanContextProps => ({
    getExecutionPlan: () => {},
    saveExecutionPlan: () => {},
    showPlanXml: () => {},
    showQuery: () => {},
    updateTotalCost: () => {},
});

export const QueryExecutionPlanTab = () => {
    const classes = useStyles();
    const queryResultCommands = useContext(QueryResultCommandsContext);
    const queryResultState = useContext(QueryResultStateContext);

    const executionPlanCommands = useMemo<ExecutionPlanContextProps>(() => {
        if (!queryResultCommands) {
            return createNoOpExecutionPlanCommands();
        }
        return {
            getExecutionPlan: () => {
                if (queryResultState?.uri) {
                    queryResultCommands.getExecutionPlan(queryResultState.uri);
                }
            },
            saveExecutionPlan: (sqlPlanContent: string) => {
                queryResultCommands.saveExecutionPlan(sqlPlanContent);
            },
            showPlanXml: (sqlPlanContent: string) => {
                queryResultCommands.showPlanXml(sqlPlanContent);
            },
            showQuery: (query: string) => {
                queryResultCommands.showQuery(query);
            },
            updateTotalCost: (addedCost: number) => {
                queryResultCommands.updateTotalCost(addedCost);
            },
        };
    }, [queryResultCommands, queryResultState?.uri]);

    return (
        <div
            id={"executionPlanResultsTab"}
            className={classes.queryResultContainer}
            style={{ height: "100%", minHeight: "300px" }}>
            <ExecutionPlanStateProvider
                stateOverride={queryResultState}
                commandsOverride={executionPlanCommands}>
                <ExecutionPlanPage />
            </ExecutionPlanStateProvider>
        </div>
    );
};
