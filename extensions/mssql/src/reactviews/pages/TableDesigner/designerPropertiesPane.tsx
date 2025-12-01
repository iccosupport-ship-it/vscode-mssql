/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    Accordion,
    AccordionHeader,
    AccordionItem,
    AccordionPanel,
    Button,
    SearchBox,
    Text,
    makeStyles,
    shorthands,
} from "@fluentui/react-components";
import { useContext, useEffect, useMemo, useState } from "react";
import { TableDesignerContext } from "./tableDesignerStateProvider";
import { DesignerCheckbox } from "./designerCheckbox";
import { DesignerInputBox } from "./designerInputBox";
import { DesignerDropdown } from "./designerDropdown";
import { DesignerTable } from "./designerTable";
import {
    CheckBoxProperties,
    DesignerDataPropertyInfo,
    DesignerTableProperties,
    DropDownProperties,
    InputBoxProperties,
} from "../../../sharedInterfaces/tableDesigner";
import {
    ChevronRight16Regular,
    ChevronLeft16Regular,
    Dismiss16Regular,
} from "@fluentui/react-icons";
import { locConstants } from "../../common/locConstants";
import { useAccordionStyles } from "../../common/styles";

const useStyles = makeStyles({
    root: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
    },
    title: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 0px",
        backgroundColor: "var(--vscode-editorWidget-background)",
        position: "relative",
        zIndex: 1,
    },
    stack: {
        marginBottom: "10px",
        flexDirection: "column",
        // gap between children
        "> *": {
            marginBottom: "10px",
        },
        ...shorthands.flex(1),
        overflowY: "auto",
        backgroundColor: "var(--vscode-editor-background)",
    },
    group: {
        overflowX: "auto",
        overflowY: "hidden",
        "> *": {
            marginBottom: "10px",
        },
    },
    searchContainer: {
        padding: "0 12px 12px",
        backgroundColor: "var(--vscode-editor-background)",
        borderBottom: "1px solid var(--vscode-editorWidget-border)",
    },
});

export const DesignerPropertiesPane = () => {
    const classes = useStyles();
    const accordionStyles = useAccordionStyles();
    const context = useContext(TableDesignerContext);
    if (!context) {
        return null;
    }
    const propertiesPaneData = context.state.propertiesPaneData!;
    const componentPath = propertiesPaneData.componentPath!;
    const tablePropertyName = componentPath[0] as string;
    const index = componentPath[componentPath.length - 1] as number;
    const parentTableProperties = context.state.propertiesPaneData?.component
        .componentProperties as DesignerTableProperties;
    const parentTablePropertiesModel = context.state.model![
        tablePropertyName
    ] as DesignerTableProperties;
    const data = parentTablePropertiesModel.data![index];

    const groups = Array.from(
        new Set(parentTableProperties.itemProperties?.filter((i) => i.group).map((i) => i.group)),
    );
    groups?.unshift("General");

    const [searchText, setSearchText] = useState("");
    const normalizedSearchText = searchText.trim().toLowerCase();

    const renderAccordionItem = (
        group: string | undefined,
        groupItem: DesignerDataPropertyInfo[],
    ) => {
        if (!group) {
            return undefined;
        }
        return (
            <AccordionItem value={group} className={accordionStyles.accordionItem} key={group}>
                <AccordionHeader expandIconPosition="end">{group}</AccordionHeader>
                <AccordionPanel>
                    <div className={classes.group}>
                        {groupItem.map((item) => {
                            if (!data) {
                                return undefined;
                            }
                            const modelValue = data![item.propertyName];
                            switch (item.componentType) {
                                case "checkbox":
                                    return (
                                        <DesignerCheckbox
                                            UiArea="PropertiesView"
                                            component={item}
                                            model={modelValue as CheckBoxProperties}
                                            componentPath={[
                                                ...propertiesPaneData!.componentPath,
                                                item.propertyName,
                                            ]}
                                            key={`${group}-${item.propertyName}`}
                                        />
                                    );
                                case "input":
                                    return (
                                        <DesignerInputBox
                                            UiArea="PropertiesView"
                                            component={item}
                                            model={modelValue as InputBoxProperties}
                                            componentPath={[
                                                ...propertiesPaneData!.componentPath,
                                                item.propertyName,
                                            ]}
                                            key={`${group}-${item.propertyName}`}
                                        />
                                    );
                                case "dropdown":
                                    return (
                                        <DesignerDropdown
                                            UiArea="PropertiesView"
                                            component={item}
                                            model={modelValue as DropDownProperties}
                                            componentPath={[
                                                ...propertiesPaneData!.componentPath,
                                                item.propertyName,
                                            ]}
                                            key={`${group}-${item.propertyName}`}
                                        />
                                    );
                                case "table":
                                    return (
                                        <DesignerTable
                                            UiArea="PropertiesView"
                                            component={item}
                                            model={modelValue as DesignerTableProperties}
                                            componentPath={[
                                                ...propertiesPaneData!.componentPath,
                                                item.propertyName,
                                            ]}
                                            key={`${group}-${item.propertyName}`}
                                        />
                                    );
                            }
                        })}
                    </div>
                </AccordionPanel>
            </AccordionItem>
        );
    };

    const sortedGroups = useMemo(() => {
        if (!groups) {
            return [] as (string | undefined)[];
        }
        return [...groups].sort((a, b) => {
            if (!a || !b) {
                return 0;
            }
            if (
                parentTableProperties.expandedGroups?.includes(a) &&
                !parentTableProperties.expandedGroups?.includes(b)
            ) {
                return -1;
            }
            if (
                parentTableProperties.expandedGroups?.includes(b) &&
                !parentTableProperties.expandedGroups?.includes(a)
            ) {
                return 1;
            }
            return 0;
        });
    }, [groups, parentTableProperties.expandedGroups]);

    const baseGroupItems = useMemo(() => {
        if (!data) {
            return [] as { group: string; items: DesignerDataPropertyInfo[] }[];
        }
        return (
            sortedGroups
                ?.map((group) => {
                    if (!group) {
                        return undefined;
                    }
                    const groupItems = parentTableProperties
                        .itemProperties!.filter(
                            (i) => (group === "General" && !i.group) || group === i.group,
                        )
                        .filter((item) => {
                            if (item.showInPropertiesView === false) {
                                return false;
                            }
                            const modelValue = data[item.propertyName];
                            if (!modelValue) {
                                return false;
                            }
                            if (
                                (
                                    modelValue as
                                        | InputBoxProperties
                                        | CheckBoxProperties
                                        | DropDownProperties
                                )?.enabled === false
                            ) {
                                return false;
                            }
                            return true;
                        });
                    if (groupItems.length === 0) {
                        return undefined;
                    }
                    return { group, items: groupItems };
                })
                .filter(
                    (entry): entry is { group: string; items: DesignerDataPropertyInfo[] } =>
                        !!entry,
                ) ?? []
        );
    }, [sortedGroups, parentTableProperties.itemProperties, data]);

    const availableGroupNames = useMemo(
        () => baseGroupItems.map((entry) => entry.group),
        [baseGroupItems],
    );

    const doesItemMatchSearch = (item: DesignerDataPropertyInfo, query: string) => {
        if (!query) {
            return true;
        }
        const componentTitle = (item.componentProperties as { title?: string }).title ?? "";
        const searchableText =
            `${componentTitle} ${item.propertyName} ${item.description ?? ""}`.toLowerCase();
        return searchableText.includes(query);
    };

    const { accordionItems, matchingGroups } = useMemo(() => {
        if (!data) {
            return { accordionItems: [] as JSX.Element[], matchingGroups: [] as string[] };
        }
        const matchedGroups = new Set<string>();
        const items = baseGroupItems
            .map((entry) => {
                const filteredItems = normalizedSearchText
                    ? entry.items.filter((item) => doesItemMatchSearch(item, normalizedSearchText))
                    : entry.items;
                if (filteredItems.length === 0) {
                    return undefined;
                }
                if (normalizedSearchText) {
                    matchedGroups.add(entry.group);
                }
                return renderAccordionItem(entry.group, filteredItems);
            })
            .filter((item): item is JSX.Element => !!item);
        return { accordionItems: items, matchingGroups: Array.from(matchedGroups) };
    }, [baseGroupItems, normalizedSearchText, data]);

    const defaultOpenGroups = useMemo(() => {
        if (
            parentTableProperties.expandedGroups &&
            parentTableProperties.expandedGroups.length > 0
        ) {
            return parentTableProperties.expandedGroups;
        }
        if (availableGroupNames.length > 0) {
            return [availableGroupNames[0]];
        }
        return [];
    }, [parentTableProperties.expandedGroups, availableGroupNames]);

    const componentPathKey = propertiesPaneData.componentPath?.join("/") ?? "";
    const [openGroups, setOpenGroups] = useState<string[]>(defaultOpenGroups);

    useEffect(() => {
        setOpenGroups(defaultOpenGroups);
    }, [componentPathKey, defaultOpenGroups]);

    const computedOpenItems = normalizedSearchText
        ? Array.from(new Set([...openGroups, ...matchingGroups]))
        : openGroups;

    if (!data) {
        return null;
    }
    return (
        <div className={classes.root}>
            <div className={classes.title}>
                <Button
                    appearance="subtle"
                    onClick={() => {
                        if (context.propertiesPaneResizeInfo.isMaximized) {
                            context.propertiesPaneResizeInfo.setCurrentWidth(
                                context.propertiesPaneResizeInfo.originalWidth,
                            );
                        }
                        context.propertiesPaneResizeInfo.setIsMaximized(
                            !context.propertiesPaneResizeInfo.isMaximized,
                        );
                    }}
                    title={
                        context.propertiesPaneResizeInfo.isMaximized
                            ? locConstants.tableDesigner.restorePropertiesPane
                            : locConstants.tableDesigner.expandPropertiesPane
                    }
                    icon={
                        context.propertiesPaneResizeInfo.isMaximized ? (
                            <ChevronRight16Regular />
                        ) : (
                            <ChevronLeft16Regular />
                        )
                    }
                    style={{
                        marginRight: "0px",
                    }}
                />
                <Text
                    size={400}
                    weight="semibold"
                    style={{
                        flex: 1,
                        lineHeight: "28px",
                    }}>
                    {locConstants.tableDesigner.propertiesPaneTitle(
                        parentTableProperties.objectTypeDisplayName ?? "",
                    )}
                </Text>
                <Button
                    appearance="subtle"
                    onClick={() => {
                        context.setPropertiesComponents(undefined);
                    }}
                    title={locConstants.common.close}
                    icon={<Dismiss16Regular />}
                />
            </div>
            <div className={classes.searchContainer}>
                <SearchBox
                    size="small"
                    placeholder={locConstants.common.search}
                    value={searchText}
                    onChange={(_e, data) => setSearchText(data.value ?? "")}
                    style={{ width: "100%" }}
                />
            </div>
            <div className={classes.stack}>
                {accordionItems.length > 0 ? (
                    <Accordion
                        multiple
                        collapsible
                        openItems={computedOpenItems}
                        onToggle={(_e, data) => {
                            setOpenGroups((data.openItems as string[]) ?? []);
                        }}>
                        {accordionItems}
                    </Accordion>
                ) : (
                    <Text style={{ padding: "12px" }}>{locConstants.common.noResults}</Text>
                )}
            </div>
        </div>
    );
};
