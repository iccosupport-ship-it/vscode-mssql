/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    Accordion,
    AccordionHeader,
    AccordionItem,
    AccordionPanel,
    Badge,
    Button,
    SearchBox,
    Text,
    makeStyles,
} from "@fluentui/react-components";
import { Add16Filled, Delete16Regular, ReorderRegular } from "@fluentui/react-icons";
import { useContext, useEffect, useMemo, useState } from "react";
import * as designer from "../../../sharedInterfaces/tableDesigner";
import { DesignerInputBox } from "./designerInputBox";
import { DesignerDropdown } from "./designerDropdown";
import { DesignerCheckbox } from "./designerCheckbox";
import { DesignerTable } from "./designerTable";
import { TableDesignerContext } from "./tableDesignerStateProvider";
import { locConstants } from "../../common/locConstants";
import { useAccordionStyles } from "../../common/styles";

type TableRowValue =
    | designer.InputBoxProperties
    | designer.CheckBoxProperties
    | designer.DropDownProperties
    | designer.DesignerTableProperties
    | boolean
    | undefined;

type TableRow = designer.DesignerTableComponentDataItem & {
    rowId?: number;
    item?: Record<string, TableRowValue>;
};

const useStyles = makeStyles({
    root: {
        display: "flex",
        height: "100%",
        gap: "12px",
    },
    listPanel: {
        width: "320px",
        minWidth: "260px",
        borderRight: "1px solid var(--vscode-panel-border)",
        display: "flex",
        flexDirection: "column",
    },
    listHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "4px 8px",
        borderBottom: "1px solid var(--vscode-panel-border)",
    },
    listItems: {
        flex: 1,
        overflowY: "auto",
    },
    listItem: {
        padding: "8px",
        borderBottom: "1px solid var(--vscode-panel-border)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
    },
    listItemSelected: {
        backgroundColor: "var(--vscode-list-hoverBackground)",
    },
    listItemHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
    },
    badges: {
        display: "flex",
        gap: "4px",
        flexWrap: "wrap",
    },
    detailPanel: {
        flex: 1,
        padding: "12px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        minHeight: 0,
    },
    detailHeader: {
        display: "flex",
        alignItems: "center",
        gap: "12px",
        flexWrap: "wrap",
        flexShrink: 0,
        borderBottom: "1px solid var(--vscode-panel-border)",
        paddingBottom: "8px",
        marginBottom: "8px",
    },
    detailTitle: {
        flexShrink: 0,
    },
    detailSearch: {
        flex: 1,
        minWidth: "220px",
    },
    detailGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "12px",
        paddingBottom: "12px",
    },
    groupContainer: {
        display: "flex",
        flexDirection: "column",
        paddingBottom: "8px",
    },
    detailContent: {
        flex: 1,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        minHeight: 0,
        paddingBottom: "16px",
    },
    tablePropertyWrapper: {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
    },
    emptyState: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--vscode-descriptionForeground)",
    },
});

export interface DesignerColumnsTabProps {
    component: designer.DesignerDataPropertyInfo;
    model: designer.DesignerTableProperties;
}

const badge = (text: string) => (
    <Badge key={text} appearance="filled" color="brand">
        {text}
    </Badge>
);

export const DesignerColumnsTab = ({ component, model }: DesignerColumnsTabProps) => {
    const context = useContext(TableDesignerContext);
    const classes = useStyles();
    const accordionStyles = useAccordionStyles();
    const rows = (model.data ?? []) as TableRow[];
    const getRowValues = (row: TableRow): Record<string, TableRowValue> =>
        (row.item ?? row) as Record<string, TableRowValue>;
    const getRowId = (row: TableRow | undefined, fallback: number) =>
        typeof row?.rowId === "number" ? row.rowId : fallback;
    const [selectedIndex, setSelectedIndex] = useState(rows.length > 0 ? 0 : -1);
    const [draggedIndex, setDraggedIndex] = useState<number | undefined>(undefined);
    const [detailSearchText, setDetailSearchText] = useState("");
    const normalizedDetailSearch = detailSearchText.trim().toLowerCase();

    const selectRow = (index: number) => {
        setSelectedIndex(index);
        if (context) {
            context.setPropertiesComponents({
                componentPath: [component.propertyName, getRowId(rows[index], index)],
                component,
                model,
            });
        }
    };

    const handleAdd = () => {
        if (!context) {
            return;
        }
        context.processTableEdit({
            path: [component.propertyName, rows.length],
            source: "TabsView",
            type: designer.DesignerEditType.Add,
            value: undefined,
        });
    };

    const handleRemove = (rowIndex: number) => {
        if (!context) {
            return;
        }
        context.processTableEdit({
            path: [component.propertyName, getRowId(rows[rowIndex], rowIndex)],
            source: "TabsView",
            type: designer.DesignerEditType.Remove,
            value: undefined,
        });
    };

    const handleMove = (from: number, to: number) => {
        if (!context || from === to) {
            return;
        }
        context.processTableEdit({
            path: [component.propertyName, from],
            source: "TabsView",
            type: designer.DesignerEditType.Move,
            value: to,
        });
        setSelectedIndex(to);
    };

    const getRowBadges = (row: TableRow | undefined) => {
        const badges: JSX.Element[] = [];
        if (!row) {
            return badges;
        }
        const item = getRowValues(row);
        const pk = item[designer.TableColumnProperty.IsPrimaryKey] as designer.CheckBoxProperties;
        if (pk?.checked) {
            badges.push(badge("PK"));
        }
        const identity = item[
            designer.TableColumnProperty.IsIdentity
        ] as designer.CheckBoxProperties;
        if (identity?.checked) {
            badges.push(badge("Identity"));
        }
        const allowNulls = item[
            designer.TableColumnProperty.AllowNulls
        ] as designer.CheckBoxProperties;
        if (allowNulls && !allowNulls.checked) {
            badges.push(badge("Not Null"));
        }
        return badges;
    };

    const selectedRow = selectedIndex >= 0 ? rows[selectedIndex] : undefined;

    useEffect(() => {
        if (rows.length === 0) {
            setSelectedIndex(-1);
            context?.setPropertiesComponents(undefined);
            return;
        }
        if (selectedIndex === -1 || selectedIndex >= rows.length) {
            selectRow(0);
        }
    }, [rows.length]);

    useEffect(() => {
        setDetailSearchText("");
    }, [selectedIndex]);

    const propertiesByGroup = useMemo(() => {
        if (!component.componentProperties || !selectedRow) {
            return [] as { group: string; properties: designer.DesignerDataPropertyInfo[] }[];
        }
        const tableProps = component.componentProperties as designer.DesignerTableProperties;
        const itemProps = tableProps.itemProperties;
        if (!itemProps) {
            return [];
        }
        const map = new Map<string, designer.DesignerDataPropertyInfo[]>();
        for (const prop of itemProps) {
            if (prop.showInPropertiesView === false) {
                continue;
            }
            const groupName = prop.group ?? "General";
            if (!map.has(groupName)) {
                map.set(groupName, []);
            }
            map.get(groupName)!.push(prop);
        }
        const grouped = Array.from(map.entries()).map(([group, props]) => ({
            group,
            properties: props,
        }));

        if (!normalizedDetailSearch) {
            return grouped;
        }

        return grouped
            .map((group) => ({
                group: group.group,
                properties: group.properties.filter((prop) => {
                    const title = prop.componentProperties.title ?? prop.propertyName;
                    const description = prop.description ?? "";
                    const searchTarget = `${title}\u0000${description}`.toLowerCase();
                    return searchTarget.includes(normalizedDetailSearch);
                }),
            }))
            .filter((group) => group.properties.length > 0);
    }, [component.componentProperties, selectedRow, normalizedDetailSearch]);

    const defaultOpenGroups = useMemo(() => {
        if (!component.componentProperties) {
            return [] as string[];
        }
        if (normalizedDetailSearch) {
            return propertiesByGroup.map((g) => g.group);
        }
        const tableProps = component.componentProperties as designer.DesignerTableProperties;
        return tableProps.expandedGroups ?? propertiesByGroup.map((g) => g.group);
    }, [component.componentProperties, propertiesByGroup, normalizedDetailSearch]);

    const renderProperty = (
        row: TableRow,
        rowIndex: number,
        property: designer.DesignerDataPropertyInfo,
    ) => {
        const modelValue = getRowValues(row)[property.propertyName];
        const path: (string | number)[] = [
            component.propertyName,
            getRowId(row, rowIndex),
            property.propertyName,
        ];
        switch (property.componentType) {
            case "input":
            case "textarea":
                return (
                    <div>
                        <DesignerInputBox
                            component={property}
                            model={modelValue as designer.InputBoxProperties}
                            componentPath={path}
                            UiArea="PropertiesView"
                            showLabel={true}
                        />
                    </div>
                );
            case "dropdown":
                return (
                    <div>
                        <DesignerDropdown
                            component={property}
                            model={modelValue as designer.DropDownProperties}
                            componentPath={path}
                            UiArea="PropertiesView"
                            showLabel={true}
                        />
                    </div>
                );
            case "checkbox":
                return (
                    <div>
                        <DesignerCheckbox
                            component={property}
                            model={modelValue as designer.CheckBoxProperties}
                            componentPath={path}
                            UiArea="PropertiesView"
                            showLabel={true}
                        />
                    </div>
                );
            case "table":
                return (
                    <div className={classes.tablePropertyWrapper}>
                        <Text weight="semibold">
                            {property.componentProperties.title ?? property.propertyName}
                        </Text>
                        <DesignerTable
                            component={property}
                            model={modelValue as designer.DesignerTableProperties}
                            componentPath={path}
                            UiArea="PropertiesView"
                        />
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className={classes.root}>
            <div className={classes.listPanel}>
                <div className={classes.listHeader}>
                    <Text weight="semibold">
                        {component.componentProperties.title ?? locConstants.tableDesigner.columns}
                    </Text>
                    <Button appearance="primary" icon={<Add16Filled />} onClick={handleAdd}>
                        New
                    </Button>
                </div>
                <div className={classes.listItems}>
                    {rows.map((row, index) => {
                        if (!row) {
                            return null;
                        }
                        const item = getRowValues(row);
                        const name =
                            (item[
                                designer.TableColumnProperty.Name
                            ] as designer.InputBoxProperties)?.value ?? "(Column)";
                        const dataType = (
                            item[
                                designer.TableColumnProperty.AdvancedType
                            ] as designer.DropDownProperties
                        )?.value;
                        const rowId = getRowId(row, index);
                        return (
                            <div
                                key={rowId.toString()}
                                className={`${classes.listItem} ${index === selectedIndex ? classes.listItemSelected : ""}`}
                                onClick={() => selectRow(index)}
                                draggable
                                onDragStart={() => setDraggedIndex(index)}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    if (draggedIndex !== undefined) {
                                        handleMove(draggedIndex, index);
                                        setDraggedIndex(undefined);
                                    }
                                }}
                                onDragEnd={() => setDraggedIndex(undefined)}>
                                <div className={classes.listItemHeader}>
                                    <Text weight="semibold">{name}</Text>
                                    <div style={{ display: "flex", gap: "4px" }}>
                                        <Button
                                            appearance="subtle"
                                            icon={<Delete16Regular />}
                                            size="small"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemove(index);
                                            }}
                                        />
                                        <Button
                                            appearance="subtle"
                                            icon={<ReorderRegular />}
                                            size="small"
                                            draggable
                                            onDragStart={(e) => {
                                                e.stopPropagation();
                                                setDraggedIndex(index);
                                            }}
                                            onDragEnd={(e) => {
                                                e.stopPropagation();
                                                setDraggedIndex(undefined);
                                            }}
                                        />
                                    </div>
                                </div>
                                <Text size={200}>{dataType}</Text>
                                <div className={classes.badges}>{getRowBadges(row)}</div>
                            </div>
                        );
                    })}
                    {rows.length === 0 && (
                        <div className={classes.emptyState}>
                            {locConstants.tableDesigner.noItems}
                        </div>
                    )}
                </div>
            </div>
            <div className={classes.detailPanel}>
                {selectedRow ? (
                    <>
                        <div className={classes.detailHeader}>
                            <Text weight="semibold" size={400} className={classes.detailTitle}>
                                Column Properties
                            </Text>
                            <SearchBox
                                className={classes.detailSearch}
                                placeholder={locConstants.tableDesigner.searchProperties}
                                value={detailSearchText}
                                onChange={(_e, data) => setDetailSearchText(data.value ?? "")}
                            />
                        </div>
                        <div className={classes.detailContent}>
                            {propertiesByGroup.length === 0 ? (
                                <div className={classes.emptyState}>
                                    {normalizedDetailSearch
                                        ? locConstants.common.noResults
                                        : locConstants.tableDesigner.noItems}
                                </div>
                            ) : (
                                <Accordion
                                    collapsible
                                    multiple
                                    defaultOpenItems={defaultOpenGroups}
                                    className={classes.groupContainer}>
                                    {propertiesByGroup.map((group) => (
                                        <AccordionItem
                                            value={group.group}
                                            key={group.group}
                                            className={accordionStyles.accordionItem}>
                                            <AccordionHeader expandIconPosition="end">
                                                {group.group}
                                            </AccordionHeader>
                                            <AccordionPanel>
                                                <div className={classes.detailGrid}>
                                                    {group.properties.map((prop) => (
                                                        <div key={prop.propertyName}>
                                                            {renderProperty(
                                                                selectedRow,
                                                                selectedIndex,
                                                                prop,
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </AccordionPanel>
                                        </AccordionItem>
                                    ))}
                                </Accordion>
                            )}
                        </div>
                    </>
                ) : (
                    <div className={classes.emptyState}>
                        {locConstants.tableDesigner.selectItem}
                    </div>
                )}
            </div>
        </div>
    );
};
