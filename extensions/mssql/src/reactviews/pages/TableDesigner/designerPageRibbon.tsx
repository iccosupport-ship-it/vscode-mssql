/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Toolbar } from "@fluentui/react-toolbar";
import {
    Button,
    Divider,
    Field,
    Input,
    makeStyles,
    shorthands,
} from "@fluentui/react-components";
import { useContext, useEffect, useState } from "react";
import { TableDesignerContext } from "./tableDesignerStateProvider";
import { DesignerChangesPreviewButton } from "./designerChangesPreviewButton";
import * as FluentIcons from "@fluentui/react-icons";
import { locConstants } from "../../common/locConstants";
import { SearchableDropdown } from "../../common/searchableDropdown.component";
import { DesignerEditType, DropDownProperties, InputBoxProperties } from "../../../sharedInterfaces/tableDesigner";

const useStyles = makeStyles({
    separator: {
        ...shorthands.margin("0px", "-20px", "0px", "0px"),
        ...shorthands.padding("0px"),
        fontSize: "5px",
    },
    ribbonContainer: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "5px 10px",
        gap: "12px",
        flexWrap: "wrap",
    },
    fieldGroup: {
        display: "flex",
        alignItems: "center",
        gap: "12px",
        flexWrap: "wrap",
        flex: 1,
    },
    toolbarGroup: {
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: "8px",
    },
    fieldWidth: {
        minWidth: "220px",
        maxWidth: "320px",
        flexShrink: 0,
    },
});

export const DesignerPageRibbon = () => {
    const designerContext = useContext(TableDesignerContext);
    const classes = useStyles();
    if (!designerContext) {
        return undefined;
    }
    const state = designerContext.state;
    if (!state) {
        return undefined;
    }

    const [tableName, setTableName] = useState((state.model!["name"] as InputBoxProperties).value);
    const [schema, setSchema] = useState((state.model!["schema"] as InputBoxProperties).value);

    useEffect(() => {
        setTableName((state.model!["name"] as InputBoxProperties).value);
        setSchema((state.model!["schema"] as InputBoxProperties).value);
    }, [state.model]);

    const getSortedSchemaValues = () => {
        const schemas = (state?.model?.["schema"] as DropDownProperties).values;
        const systemSchemas = new Set([
            "db_accessadmin",
            "db_backupoperator",
            "db_datareader",
            "db_datawriter",
            "db_ddladmin",
            "db_denydatareader",
            "db_denydatawriter",
            "db_owner",
            "db_securityadmin",
        ]);
        const userSchemas: string[] = [];
        const sysSchemas: string[] = [];
        for (const schemaOption of schemas) {
            if (systemSchemas.has(schemaOption)) {
                sysSchemas.push(schemaOption);
            } else {
                userSchemas.push(schemaOption);
            }
        }
        userSchemas.sort((a, b) => a.localeCompare(b));
        sysSchemas.sort((a, b) => a.localeCompare(b));
        return [...userSchemas, ...sysSchemas];
    };

    const labelProps = (text: string) => ({
        children: (
            <span
                style={{
                    whiteSpace: "nowrap",
                }}>
                {text}
            </span>
        ),
    });

    const renderNameField = () => (
        <Field
            size="small"
            label={labelProps(locConstants.tableDesigner.tableName)}
            orientation="horizontal"
            className={classes.fieldWidth}>
            <Input
                size="small"
                value={tableName}
                onChange={(_event, data) => {
                    setTableName(data.value);
                }}
                autoFocus
                onBlur={() => {
                    designerContext.processTableEdit({
                        source: "TabsView",
                        type: DesignerEditType.Update,
                        path: ["name"],
                        value: tableName,
                    });
                }}
                aria-label={locConstants.tableDesigner.tableName}
            />
        </Field>
    );

    const renderSchemaField = () => (
        <Field
            size="small"
            label={labelProps(locConstants.tableDesigner.schema)}
            orientation="horizontal"
            className={classes.fieldWidth}>
            <SearchableDropdown
                size="small"
                options={getSortedSchemaValues().map((option) => ({
                    value: option,
                    text: option,
                }))}
                onSelect={(option) => {
                    designerContext.processTableEdit({
                        source: "TabsView",
                        type: DesignerEditType.Update,
                        path: ["schema"],
                        value: option.value,
                    });
                    setSchema(option.value as string);
                }}
                selectedOption={{
                    value: schema,
                }}
                ariaLabel={locConstants.tableDesigner.schema}
                style={{ width: "100%" }}
            />
        </Field>
    );

    return (
        <div>
            <div className={classes.ribbonContainer}>
                <div className={classes.fieldGroup}>
                    {renderNameField()}
                    {renderSchemaField()}
                </div>
                <div className={classes.toolbarGroup}>
                    <Toolbar
                        size="small"
                        style={{
                            paddingTop: "5px",
                            paddingBottom: "5px",
                            gap: "8px",
                        }}>
                        <Button
                            size="small"
                            appearance="subtle"
                            icon={<FluentIcons.Code16Filled />}
                            title={locConstants.schemaDesigner.definition}
                            onClick={() => designerContext.toggleDefinitionPane()}>
                            {locConstants.schemaDesigner.definition}
                        </Button>
                        <DesignerChangesPreviewButton />
                    </Toolbar>
                </div>
            </div>
            <Divider className={classes.separator} />
        </div>
    );
};
