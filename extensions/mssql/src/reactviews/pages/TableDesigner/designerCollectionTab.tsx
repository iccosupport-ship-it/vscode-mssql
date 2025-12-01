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
import { locConstants } from "../../common/locConstants";
import { TableDesignerContext } from "./tableDesignerStateProvider";
import { DesignerInputBox } from "./designerInputBox";
import { DesignerDropdown } from "./designerDropdown";
import { DesignerCheckbox } from "./designerCheckbox";
import { DesignerTable } from "./designerTable";
import { useAccordionStyles } from "../../common/styles";

export interface DesignerCollectionTabProps {
    components: designer.DesignerDataPropertyInfo[];
}

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

interface TableSection {
    component: designer.DesignerDataPropertyInfo;
    model: designer.DesignerTableProperties;
    rows: TableRow[];
}

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
        overflow: "hidden",
    },
    listSections: {
        flex: 1,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        paddingRight: "4px",
    },
    listSection: {
        borderBottom: "1px solid var(--vscode-panel-border)",
        paddingBottom: "12px",
        marginBottom: "12px",
    },
    listHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "4px 8px",
    },
    listItems: {
        display: "flex",
        flexDirection: "column",
        marginTop: "4px",
    },
    listItem: {
        padding: "8px",
        borderBottom: "1px solid var(--vscode-panel-border)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        backgroundColor: "transparent",
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
    detailContent: {
        flex: 1,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        minHeight: 0,
        paddingBottom: "16px",
    },
    detailGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "12px",
    },
    groupContainer: {
        display: "flex",
        flexDirection: "column",
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
    listEmptyState: {
        padding: "8px",
        color: "var(--vscode-descriptionForeground)",
    },
});

export const DesignerCollectionTab = ({ components }: DesignerCollectionTabProps) => {
    const context = useContext(TableDesignerContext);
    const classes = useStyles();
    const accordionStyles = useAccordionStyles();

    if (!context) {
        return null;
    }

    const tableSections: TableSection[] = useMemo(() => {
        return components
            .filter((component) => component.componentType === "table")
            .map((component) => ({
                component,
                model: context.state.model?.[component.propertyName] as designer.DesignerTableProperties,
            }))
            .filter((section): section is TableSection => Boolean(section.model))
            .map((section) => ({
                ...section,
                rows: ((section.model.data ?? []) as TableRow[]) ?? [],
            }));
    }, [components, context.state.model]);

    const findFirstAvailableSelection = () => {
        for (const section of tableSections) {
            if (section.rows.length > 0) {
                return {
                    sectionName: section.component.propertyName,
                    index: 0,
                };
            }
        }
        return undefined;
    };

    const [selected, setSelected] = useState<{ sectionName: string; index: number } | undefined>(
        findFirstAvailableSelection(),
    );
    const [dragState, setDragState] = useState<{ sectionName: string; index: number } | undefined>(
        undefined,
    );
    const [detailSearchText, setDetailSearchText] = useState("");

    const tableSignature = useMemo(
        () => tableSections.map((section) => `${section.component.propertyName}:${section.rows.length}`).join("|"),
        [tableSections],
    );

    useEffect(() => {
        const ensureSelection = () => {
            if (!selected) {
                const initial = findFirstAvailableSelection();
                if (initial) {
                    selectRow(initial.sectionName, initial.index);
                }
                return;
            }
            const currentSection = tableSections.find(
                (section) => section.component.propertyName === selected.sectionName,
            );
            if (!currentSection || selected.index >= currentSection.rows.length) {
                const fallback = findFirstAvailableSelection();
                if (fallback) {
                    selectRow(fallback.sectionName, fallback.index);
                } else {
                    setSelected(undefined);
                    context.setPropertiesComponents(undefined);
                }
            }
        };
        ensureSelection();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tableSignature]);

    useEffect(() => {
        setDetailSearchText("");
    }, [selected?.sectionName, selected?.index]);

    const getRowValues = (row: TableRow): Record<string, TableRowValue> =>
        (row.item ?? row) as Record<string, TableRowValue>;
    const getRowId = (row: TableRow | undefined, fallback: number) =>
        typeof row?.rowId === "number" ? row.rowId : fallback;

    const selectRow = (sectionName: string, index: number) => {
        const section = tableSections.find((s) => s.component.propertyName === sectionName);
        if (!section || index < 0 || index >= section.rows.length) {
            return;
        }
        setSelected({ sectionName, index });
        const row = section.rows[index];
        if (row) {
            context.setPropertiesComponents({
                componentPath: [section.component.propertyName, getRowId(row, index)],
                component: section.component,
                model: section.model,
            });
        }
    };

    const handleAdd = (sectionName: string) => {
        const section = tableSections.find((s) => s.component.propertyName === sectionName);
        if (!section) {
            return;
        }
        context.processTableEdit({
            path: [section.component.propertyName, section.rows.length],
            source: "TabsView",
            type: designer.DesignerEditType.Add,
            value: undefined,
        });
    };

    const handleRemove = (sectionName: string, rowIndex: number) => {
        const section = tableSections.find((s) => s.component.propertyName === sectionName);
        if (!section) {
            return;
        }
        context.processTableEdit({
            path: [section.component.propertyName, getRowId(section.rows[rowIndex], rowIndex)],
            source: "TabsView",
            type: designer.DesignerEditType.Remove,
            value: undefined,
        });
    };

    const handleMove = (sectionName: string, from: number, to: number) => {
        const section = tableSections.find((s) => s.component.propertyName === sectionName);
        if (!section || from === to) {
            return;
        }
        context.processTableEdit({
            path: [section.component.propertyName, from],
            source: "TabsView",
            type: designer.DesignerEditType.Move,
            value: to,
        });
        setSelected({ sectionName, index: to });
    };

    const normalizedDetailSearch = detailSearchText.trim().toLowerCase();

    const selectedSection = selected
        ? tableSections.find((section) => section.component.propertyName === selected.sectionName)
        : undefined;
    const selectedRow =
        selectedSection && selected ? selectedSection.rows[selected.index] : undefined;

    const propertiesByGroup = useMemo(() => {
        if (!selectedSection || !selectedRow) {
            return [] as { group: string; properties: designer.DesignerDataPropertyInfo[] }[];
        }
        const itemProps = (
            selectedSection.component.componentProperties as designer.DesignerTableProperties
        ).itemProperties;
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
        const grouped = Array.from(map.entries()).map(([group, props]) => ({ group, properties: props }));
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
    }, [selectedSection, selectedRow, normalizedDetailSearch]);

    const defaultOpenGroups = useMemo(() => {
        if (!selectedSection) {
            return [] as string[];
        }
        if (normalizedDetailSearch) {
            return propertiesByGroup.map((g) => g.group);
        }
        const tableProps = selectedSection.component
            .componentProperties as designer.DesignerTableProperties;
        return tableProps.expandedGroups ?? propertiesByGroup.map((g) => g.group);
    }, [selectedSection, propertiesByGroup, normalizedDetailSearch]);

    const renderProperty = (
        section: TableSection,
        row: TableRow,
        rowIndex: number,
        property: designer.DesignerDataPropertyInfo,
    ) => {
        const modelValue = getRowValues(row)[property.propertyName];
        const path: (string | number)[] = [
            section.component.propertyName,
            getRowId(row, rowIndex),
            property.propertyName,
        ];
        switch (property.componentType) {
            case "input":
            case "textarea":
                return (
                    <DesignerInputBox
                        component={property}
                        model={modelValue as designer.InputBoxProperties}
                        componentPath={path}
                        UiArea="PropertiesView"
                        showLabel={true}
                    />
                );
            case "dropdown":
                return (
                    <DesignerDropdown
                        component={property}
                        model={modelValue as designer.DropDownProperties}
                        componentPath={path}
                        UiArea="PropertiesView"
                        showLabel={true}
                    />
                );
            case "checkbox":
                return (
                    <DesignerCheckbox
                        component={property}
                        model={modelValue as designer.CheckBoxProperties}
                        componentPath={path}
                        UiArea="PropertiesView"
                        showLabel={true}
                    />
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

    const tryGetStringValue = (value?: TableRowValue): string | undefined => {
        if (!value || typeof value === "boolean") {
            return undefined;
        }
        if (value && typeof value === "object" && "value" in value) {
            const strValue = (value as designer.InputBoxProperties).value;
            if (typeof strValue === "string" && strValue.trim().length > 0) {
                return strValue;
            }
        }
        return undefined;
    };

    const getRowDisplayText = (section: TableSection, row: TableRow): string => {
        const values = getRowValues(row);
        const nameProperty = section.model.itemProperties?.find(
            (prop) => prop.propertyName.toLowerCase() === "name",
        );
        const nameValue = nameProperty ? tryGetStringValue(values[nameProperty.propertyName]) : undefined;
        if (nameValue) {
            return nameValue;
        }
        const fallbackProperty = section.model.itemProperties?.find(
            (prop) => prop.componentType === "input" || prop.componentType === "dropdown",
        );
        if (fallbackProperty) {
            const fallbackValue = tryGetStringValue(values[fallbackProperty.propertyName]);
            if (fallbackValue) {
                return fallbackValue;
            }
        }
        const tableProps =
            section.component.componentProperties as designer.DesignerTableProperties;
        return (
            tableProps.objectTypeDisplayName ??
            tableProps.title ??
            section.component.propertyName
        );
    };

    const getRowSubtitle = (section: TableSection, row: TableRow): string | undefined => {
        const values = getRowValues(row);
        const descriptionProperty = section.model.itemProperties?.find(
            (prop) => prop.propertyName.toLowerCase() === "description",
        );
        return descriptionProperty
            ? tryGetStringValue(values[descriptionProperty.propertyName])
            : undefined;
    };

    const badge = (text: string) => (
        <Badge key={text} appearance="filled" color="brand">
            {text}
        </Badge>
    );

    const getRowBadges = (section: TableSection, row: TableRow) => {
        const badges: JSX.Element[] = [];
        const values = getRowValues(row);
        const checkboxProps = section.model.itemProperties?.filter(
            (prop) => prop.componentType === "checkbox",
        );
        checkboxProps?.forEach((prop) => {
            const value = values[prop.propertyName] as designer.CheckBoxProperties;
            if (value?.checked) {
                badges.push(badge(prop.componentProperties.title ?? prop.propertyName));
            }
        });
        return badges;
    };

    return (
        <div className={classes.root}>
            <div className={classes.listPanel}>
                <div className={classes.listSections}>
                    {tableSections.map((section) => (
                        <div key={section.component.propertyName} className={classes.listSection}>
                            <div className={classes.listHeader}>
                                <Text weight="semibold">
                                    {section.component.componentProperties.title ??
                                        section.component.propertyName}
                                </Text>
                                <Button
                                    appearance="primary"
                                    icon={<Add16Filled />}
                                    onClick={() => handleAdd(section.component.propertyName)}>
                                    New
                                </Button>
                            </div>
                            <div className={classes.listItems}>
                                {section.rows.map((row, index) => {
                                    const isSelected =
                                        selected?.sectionName === section.component.propertyName &&
                                        selected.index === index;
                                    return (
                                        <div
                                            key={`${section.component.propertyName}-${getRowId(
                                                row,
                                                index,
                                            )}`}
                                            className={`${classes.listItem} ${
                                                isSelected ? classes.listItemSelected : ""
                                            }`}
                                            onClick={() => selectRow(section.component.propertyName, index)}
                                            draggable
                                            onDragStart={(e) => {
                                                e.stopPropagation();
                                                setDragState({
                                                    sectionName: section.component.propertyName,
                                                    index,
                                                });
                                            }}
                                            onDragOver={(e) => {
                                                if (
                                                    dragState?.sectionName ===
                                                    section.component.propertyName
                                                ) {
                                                    e.preventDefault();
                                                }
                                            }}
                                            onDrop={(e) => {
                                                if (
                                                    dragState?.sectionName ===
                                                    section.component.propertyName
                                                ) {
                                                    e.preventDefault();
                                                    handleMove(section.component.propertyName, dragState.index, index);
                                                    setDragState(undefined);
                                                }
                                            }}
                                            onDragEnd={() => setDragState(undefined)}>
                                            <div className={classes.listItemHeader}>
                                                <Text weight="semibold">
                                                    {getRowDisplayText(section, row) || locConstants.tableDesigner.columns}
                                                </Text>
                                                <div style={{ display: "flex", gap: "4px" }}>
                                                    <Button
                                                        appearance="subtle"
                                                        icon={<Delete16Regular />}
                                                        size="small"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleRemove(section.component.propertyName, index);
                                                        }}
                                                    />
                                                    <Button
                                                        appearance="subtle"
                                                        icon={<ReorderRegular />}
                                                        size="small"
                                                        draggable
                                                        onDragStart={(e) => {
                                                            e.stopPropagation();
                                                            setDragState({
                                                                sectionName: section.component.propertyName,
                                                                index,
                                                            });
                                                        }}
                                                        onDragEnd={(e) => {
                                                            e.stopPropagation();
                                                            setDragState(undefined);
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            {getRowSubtitle(section, row) && (
                                                <Text size={200}>{getRowSubtitle(section, row)}</Text>
                                            )}
                                            <div className={classes.badges}>{getRowBadges(section, row)}</div>
                                        </div>
                                    );
                                })}
                                {section.rows.length === 0 && (
                                    <div className={classes.listEmptyState}>
                                        {locConstants.tableDesigner.noItems}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {tableSections.length === 0 && (
                        <div className={classes.listEmptyState}>{locConstants.tableDesigner.noItems}</div>
                    )}
                </div>
            </div>
            <div className={classes.detailPanel}>
                {selectedSection && selectedRow && selected ? (
                    <>
                        <div className={classes.detailHeader}>
                            <Text weight="semibold" size={400} className={classes.detailTitle}>
                                {selectedSection.component.componentProperties.title ??
                                    selectedSection.component.propertyName}
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
                                                                selectedSection,
                                                                selectedRow,
                                                                selected.index,
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
