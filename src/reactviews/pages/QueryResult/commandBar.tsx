/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Button, makeStyles, Toolbar, Tooltip } from "@fluentui/react-components";
import { useContext } from "react";
import { QueryResultCommandsContext } from "./queryResultStateProvider";
import { useVscodeWebview2 } from "../../common/vscodeWebviewProvider2";
import { useQueryResultSelector } from "./queryResultSelector";
import * as qr from "../../../sharedInterfaces/queryResult";
import { locConstants } from "../../common/locConstants";
import {
    saveAsCsvIcon,
    saveAsExcelIcon,
    saveAsJsonIcon,
    saveAsInsertIcon,
} from "./queryResultUtils";
import { QueryResultSaveAsTrigger } from "../../../sharedInterfaces/queryResult";
import {
    ArrowMaximize16Filled,
    ArrowMinimize16Filled,
    DocumentTextRegular,
    TableRegular,
} from "@fluentui/react-icons";

const useStyles = makeStyles({
    commandBar: {
        width: "16px",
    },
    buttonImg: {
        display: "block",
        height: "16px",
        width: "16px",
    },
});

export interface CommandBarProps {
    uri?: string;
    resultSetSummary?: qr.ResultSetSummary;
    viewMode?: qr.QueryResultViewMode;
    onToggleMaximize?: () => void;
    isMaximized?: boolean;
    maximizeShortcut?: string;
    toggleViewShortcut?: string;
    saveShortcuts?: {
        csv?: string;
        json?: string;
        excel?: string;
        insert?: string;
    };
}

const CommandBar = (props: CommandBarProps) => {
    const classes = useStyles();
    const { themeKind } = useVscodeWebview2<qr.QueryResultWebviewState, qr.QueryResultReducers>();
    const context = useContext(QueryResultCommandsContext);
    const resultSetSummaries = useQueryResultSelector<
        Record<number, Record<number, qr.ResultSetSummary>>
    >((s) => s.resultSetSummaries);
    const selection = useQueryResultSelector<qr.ISlickRange[] | undefined>((s) => s.selection);

    if (context === undefined) {
        return undefined;
    }

    const saveResults = (buttonLabel: string) => {
        void context.extensionRpc.sendRequest(qr.SaveResultsWebviewRequest.type, {
            uri: props.uri ?? "",
            batchId: props.resultSetSummary?.batchId,
            resultId: props.resultSetSummary?.id,
            format: buttonLabel,
            selection: selection,
            origin: QueryResultSaveAsTrigger.Toolbar,
        });
    };

    const toggleViewMode = () => {
        const newMode =
            props.viewMode === qr.QueryResultViewMode.Grid
                ? qr.QueryResultViewMode.Text
                : qr.QueryResultViewMode.Grid;
        context.setResultViewMode(newMode);
    };

    const checkMultipleResults = () => {
        if (Object.keys(resultSetSummaries).length > 1) {
            return true;
        }
        for (let resultSet of Object.values(resultSetSummaries)) {
            if (Object.keys(resultSet).length > 1) {
                return true;
            }
        }
        return false;
    };

    const hasMultipleResults = () => {
        return Object.keys(resultSetSummaries).length > 0 && checkMultipleResults();
    };

    const isMaximized = props.isMaximized ?? false;
    const maximizeTooltip = props.maximizeShortcut
        ? `${locConstants.queryResult.maximize} (${props.maximizeShortcut})`
        : locConstants.queryResult.maximize;
    const restoreTooltip = props.maximizeShortcut
        ? `${locConstants.queryResult.restore} (${props.maximizeShortcut})`
        : locConstants.queryResult.restore;
    const toggleViewTooltip = props.toggleViewShortcut
        ? (text: string) => `${text} (${props.toggleViewShortcut})`
        : (text: string) => text;

    const withShortcut = (label: string, shortcut?: string) =>
        shortcut && shortcut.length > 0 ? `${label} (${shortcut})` : label;

    if (props.viewMode === qr.QueryResultViewMode.Text) {
        return (
            <div className={classes.commandBar}>
                <Tooltip
                    content={toggleViewTooltip(locConstants.queryResult.toggleToGridView)}
                    relationship="label">
                    <Button
                        appearance="subtle"
                        onClick={toggleViewMode}
                        icon={<TableRegular />}
                        title={toggleViewTooltip(locConstants.queryResult.toggleToGridView)}
                    />
                </Tooltip>
            </div>
        );
    }

    return (
        <Toolbar vertical className={classes.commandBar}>
            {/* View Mode Toggle */}
            <Tooltip
                content={
                    props.viewMode === qr.QueryResultViewMode.Grid
                        ? toggleViewTooltip(locConstants.queryResult.toggleToTextView)
                        : toggleViewTooltip(locConstants.queryResult.toggleToGridView)
                }
                relationship="label">
                <Button
                    appearance="subtle"
                    onClick={toggleViewMode}
                    icon={
                        props.viewMode === qr.QueryResultViewMode.Grid ? (
                            <DocumentTextRegular />
                        ) : (
                            <TableRegular />
                        )
                    }
                    title={
                        props.viewMode === qr.QueryResultViewMode.Grid
                            ? toggleViewTooltip(locConstants.queryResult.toggleToTextView)
                            : toggleViewTooltip(locConstants.queryResult.toggleToGridView)
                    }
                />
            </Tooltip>

            {hasMultipleResults() && props.viewMode === qr.QueryResultViewMode.Grid && (
                <Tooltip
                    content={isMaximized ? restoreTooltip : maximizeTooltip}
                    relationship="label">
                    <Button
                        appearance="subtle"
                        onClick={() => {
                            props.onToggleMaximize?.();
                        }}
                        icon={
                            isMaximized ? (
                                <ArrowMinimize16Filled className={classes.buttonImg} />
                            ) : (
                                <ArrowMaximize16Filled className={classes.buttonImg} />
                            )
                        }
                        title={isMaximized ? restoreTooltip : maximizeTooltip}></Button>
                </Tooltip>
            )}

            <Tooltip
                content={withShortcut(locConstants.queryResult.saveAsCsv, props.saveShortcuts?.csv)}
                relationship="label">
                <Button
                    appearance="subtle"
                    onClick={(_event) => {
                        saveResults("csv");
                    }}
                    icon={<img className={classes.buttonImg} src={saveAsCsvIcon(themeKind)} />}
                    className="codicon saveCsv"
                    title={withShortcut(
                        locConstants.queryResult.saveAsCsv,
                        props.saveShortcuts?.csv,
                    )}
                />
            </Tooltip>
            <Tooltip
                content={withShortcut(
                    locConstants.queryResult.saveAsJson,
                    props.saveShortcuts?.json,
                )}
                relationship="label">
                <Button
                    appearance="subtle"
                    onClick={(_event) => {
                        saveResults("json");
                    }}
                    icon={<img className={classes.buttonImg} src={saveAsJsonIcon(themeKind)} />}
                    className="codicon saveJson"
                    title={withShortcut(
                        locConstants.queryResult.saveAsJson,
                        props.saveShortcuts?.json,
                    )}
                />
            </Tooltip>
            <Tooltip
                content={withShortcut(
                    locConstants.queryResult.saveAsExcel,
                    props.saveShortcuts?.excel,
                )}
                relationship="label">
                <Button
                    appearance="subtle"
                    onClick={(_event) => {
                        saveResults("excel");
                    }}
                    icon={<img className={classes.buttonImg} src={saveAsExcelIcon(themeKind)} />}
                    className="codicon saveExcel"
                    title={withShortcut(
                        locConstants.queryResult.saveAsExcel,
                        props.saveShortcuts?.excel,
                    )}
                />
            </Tooltip>
            <Tooltip
                content={withShortcut(
                    locConstants.queryResult.saveAsInsert,
                    props.saveShortcuts?.insert,
                )}
                relationship="label">
                <Button
                    appearance="subtle"
                    onClick={(_event) => {
                        saveResults("insert");
                    }}
                    icon={<img className={classes.buttonImg} src={saveAsInsertIcon(themeKind)} />}
                    className="codicon saveInsert"
                    title={withShortcut(
                        locConstants.queryResult.saveAsInsert,
                        props.saveShortcuts?.insert,
                    )}
                />
            </Tooltip>
        </Toolbar>
    );
};

export default CommandBar;
