/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import $ from "jquery";
import React, {
    forwardRef,
    useContext,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from "react";
import "../../media/slickgrid.css";
import { ACTIONBAR_WIDTH_PX, range, Table } from "./table/table";
import { defaultTableStyles } from "./table/interfaces";
import { RowNumberColumn } from "./table/plugins/rowNumberColumn.plugin";
import { VirtualizedCollection } from "./table/asyncDataView";
import { HybridDataProvider } from "./table/hybridDataProvider";
import { hyperLinkFormatter, textFormatter, DBCellValue, escape } from "./table/formatters";
import {
    DbCellValue,
    QueryResultReducers,
    QueryResultWebviewState,
    ResultSetSummary,
} from "../../../sharedInterfaces/queryResult";
import * as DOM from "./table/dom";
import { locConstants } from "../../common/locConstants";
import { VscodeWebviewContext } from "../../common/vscodeWebviewProvider";
import { QueryResultContext } from "./queryResultStateProvider";
import { LogCallback } from "../../../sharedInterfaces/webview";
import { ContextMenuPosition } from "./table/plugins/contextMenu.plugin";
import {
    HeaderFilterPosition,
    HeaderFilterActions,
    TableFilterListElement,
} from "./table/plugins/headerFilter.plugin";
import {
    Menu,
    MenuTrigger,
    MenuPopover,
    MenuList,
    MenuItem,
    Popover,
    PopoverTrigger,
    PopoverSurface,
    Field,
    Input,
    Checkbox,
    Button,
    makeStyles,
    Text,
    tokens,
    List,
    ListItem,
} from "@fluentui/react-components";

window.jQuery = $ as any;
require("slickgrid/lib/jquery.event.drag-2.3.0.js");
require("slickgrid/lib/jquery-1.11.2.min.js");
require("slickgrid/slick.core.js");
require("slickgrid/slick.grid.js");
require("slickgrid/plugins/slick.cellrangedecorator.js");

declare global {
    interface Window {
        $: any;
        jQuery: any;
    }
}

const useStyles = makeStyles({
    filterPopover: {
        width: "220px",
        maxHeight: "450px",
        padding: "5px",
    },
    filterContainer: {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
    },
    filterList: {
        height: "200px",
        border: `1px solid ${tokens.colorNeutralStroke2}`,
        borderRadius: tokens.borderRadiusMedium,
        backgroundColor: tokens.colorNeutralBackground1,
    },
    filterItem: {
        padding: "1px 4px",
        minHeight: "24px",
        display: "flex",
        alignItems: "center",
    },
    filterButtons: {
        display: "flex",
        justifyContent: "flex-end",
        gap: "8px",
        paddingTop: "2px",
        //borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    },
    selectAllContainer: {
        padding: "2px",
        backgroundColor: tokens.colorNeutralBackground2,
        borderRadius: tokens.borderRadiusMedium,
        border: `1px solid ${tokens.colorNeutralStroke2}`,
    },
});

// For better integration with List selection, let's use a non-virtualized approach for now
// since virtualization with Fluent UI List selection can be complex
const renderFilterList = (
    items: TableFilterListElement[],
    selectedItems: string[],
    onSelectionChange: (
        event: Event | React.SyntheticEvent,
        data: { selectedItems: (string | number)[] },
    ) => void,
) => {
    if (items.length <= 100) {
        // For smaller lists, use native List with selection
        return (
            <List
                selectionMode="multiselect"
                selectedItems={selectedItems}
                onSelectionChange={onSelectionChange}
                aria-label="Filter values"
                style={{ height: "200px", overflowY: "auto" }}>
                {items.map((item) => (
                    <ListItem
                        key={item.value}
                        value={item.value}
                        checkmark={{ "aria-label": item.displayText }}
                        style={{
                            minHeight: "24px",
                            padding: "1px 4px",
                        }}>
                        <Text
                            style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}>
                            {item.displayText}
                        </Text>
                    </ListItem>
                ))}
            </List>
        );
    } else {
        // For larger lists, fall back to virtualized with manual checkboxes
        return (
            <div style={{ height: "200px", overflowY: "auto" }}>
                {items.map((item) => (
                    <div
                        key={item.value}
                        style={{
                            padding: "1px 4px",
                            minHeight: "24px",
                            display: "flex",
                            alignItems: "center",
                        }}>
                        <Checkbox
                            checked={selectedItems.includes(item.value)}
                            onChange={(_e, checkboxData) => {
                                const newSelected = checkboxData.checked
                                    ? [...selectedItems, item.value]
                                    : selectedItems.filter((v) => v !== item.value);
                                onSelectionChange({} as Event, { selectedItems: newSelected });
                            }}
                            label={
                                <Text
                                    style={{
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}>
                                    {item.displayText}
                                </Text>
                            }
                        />
                    </div>
                ))}
            </div>
        );
    }
};

export interface ResultGridProps {
    loadFunc: (offset: number, count: number) => Thenable<any[]>;
    resultSetSummary?: ResultSetSummary;
    divId?: string;
    uri?: string;
    webViewState?: VscodeWebviewContext<QueryResultWebviewState, QueryResultReducers>;
    gridParentRef?: React.RefObject<HTMLDivElement>;
    linkHandler: (fileContent: string, fileType: string) => void;
    gridId: string;
}

export interface ResultGridHandle {
    refreshGrid: () => void;
    resizeGrid: (width: number, height: number) => void;
    hideGrid: () => void;
    showGrid: () => void;
}

const ResultGrid = forwardRef<ResultGridHandle, ResultGridProps>((props: ResultGridProps, ref) => {
    const tableRef = useRef<Table<any> | null>(null);
    const styles = useStyles();

    const context = useContext(QueryResultContext);
    if (!context) {
        return undefined;
    }
    const gridContainerRef = useRef<HTMLDivElement>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [contextMenuPosition, setContextMenuPosition] = useState<ContextMenuPosition | null>(
        null,
    );
    const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);

    // Header filter state
    const [headerFilterPosition, setHeaderFilterPosition] = useState<HeaderFilterPosition | null>(
        null,
    );
    const [isHeaderFilterOpen, setIsHeaderFilterOpen] = useState(false);
    const [headerFilterActions, setHeaderFilterActions] = useState<HeaderFilterActions | null>(
        null,
    );
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set());
    const [filteredData, setFilteredData] = useState<TableFilterListElement[]>([]);

    // Convert selected filters to array format for List component
    const selectedItems = Array.from(selectedFilters);

    if (!props.gridParentRef) {
        return undefined;
    }
    const refreshGrid = () => {
        if (gridContainerRef.current) {
            while (gridContainerRef.current.firstChild) {
                gridContainerRef.current.removeChild(gridContainerRef.current.firstChild);
            }
        }
    };
    const resizeGrid = (width: number, height: number) => {
        if (!tableRef.current) {
            context.log("resizeGrid - table is not initialized");
            refreshGrid();
            setRefreshKey(refreshKey + 1);
        }
        let gridParent: HTMLElement | null;
        if (!props.resultSetSummary) {
            return;
        }
        gridParent = document.getElementById(
            `grid-parent-${props.resultSetSummary.batchId}-${props.resultSetSummary.id}`,
        );
        if (gridParent) {
            gridParent.style.height = `${height}px`;
        }
        const dimension = new DOM.Dimension(width, height);
        tableRef.current?.layout(dimension);
    };

    const hideGrid = () => {
        let gridParent: HTMLElement | null;
        if (!props.resultSetSummary) {
            return;
        }
        gridParent = document.getElementById(
            `grid-parent-${props.resultSetSummary.batchId}-${props.resultSetSummary.id}`,
        );
        if (gridParent) {
            gridParent.style.display = "none";
        }
    };

    const showGrid = () => {
        let gridParent: HTMLElement | null;
        if (!props.resultSetSummary) {
            return;
        }
        gridParent = document.getElementById(
            `grid-parent-${props.resultSetSummary.batchId}-${props.resultSetSummary.id}`,
        );
        if (gridParent) {
            gridParent.style.display = "";
        }
    };

    const handleContextMenu = (position: ContextMenuPosition) => {
        setContextMenuPosition(position);
        setIsContextMenuOpen(true);
    };

    const handleMenuItemClick = async (action: string) => {
        setIsContextMenuOpen(false); // Close menu first
        if (tableRef.current) {
            await tableRef.current.executeContextMenuAction(action);
        }
    };

    const handleMenuClose = () => {
        setIsContextMenuOpen(false);
    };

    const handleHeaderFilter = (position: HeaderFilterPosition, actions: HeaderFilterActions) => {
        setHeaderFilterPosition(position);
        setHeaderFilterActions(actions);
        setIsHeaderFilterOpen(true);

        // Initialize filter data and selection
        setFilteredData(position.filterData);
        const currentFilters = new Set(position.column.filterValues || []);
        setSelectedFilters(currentFilters);
        setSearchTerm("");
    };

    const handleHeaderFilterClose = () => {
        setIsHeaderFilterOpen(false);
        setHeaderFilterPosition(null);
        setHeaderFilterActions(null);
        setSearchTerm("");
        setSelectedFilters(new Set());
    };

    const handleHeaderFilterApply = async () => {
        if (headerFilterActions && headerFilterPosition) {
            await headerFilterActions.onApply(
                headerFilterPosition.column,
                Array.from(selectedFilters),
            );
        }
        handleHeaderFilterClose();
    };

    const handleHeaderFilterClear = async () => {
        if (headerFilterActions && headerFilterPosition) {
            await headerFilterActions.onClear(headerFilterPosition.column);
        }
        handleHeaderFilterClose();
    };

    const handleFilterSearch = (value: string) => {
        setSearchTerm(value);
        if (headerFilterPosition) {
            const filtered = headerFilterPosition.filterData.filter((item) =>
                item.displayText.toLowerCase().includes(value.toLowerCase()),
            );
            setFilteredData(filtered);
        }
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            const allValues = new Set(filteredData.map((item) => item.value));
            setSelectedFilters(allValues);
        } else {
            setSelectedFilters(new Set());
        }
    };

    // Handle List selection changes
    const handleSelectionChange = (
        _event: Event | React.SyntheticEvent,
        data: { selectedItems: (string | number)[] },
    ) => {
        // Convert to strings and filter out any non-string values
        const stringItems = data.selectedItems.filter(
            (item): item is string => typeof item === "string",
        );
        setSelectedFilters(new Set(stringItems));
    };

    const createTable = () => {
        const setupState = async () => {
            if (!tableRef.current) return;
            await tableRef.current.setupFilterState();
            await tableRef.current.restoreColumnWidths();
            await tableRef.current.setupScrollPosition();
            tableRef.current.headerFilter.enabled =
                tableRef.current.grid.getDataLength() <
                context.state.inMemoryDataProcessingThreshold!;

            tableRef.current.rerenderGrid();
        };
        const DEFAULT_FONT_SIZE = 12;
        context?.log(`resultGrid: ${context.state.fontSettings.fontSize}`);

        const ROW_HEIGHT = context.state.fontSettings.fontSize! + 12; // 12 px is the padding
        const COLUMN_WIDTH = Math.max(
            (context.state.fontSettings.fontSize! / DEFAULT_FONT_SIZE) * 120,
            120,
        ); // Scale width with font size, but keep a minimum of 120px
        if (!props.resultSetSummary || !props.linkHandler) {
            return;
        }

        let columns: Slick.Column<Slick.SlickData>[] = props.resultSetSummary.columnInfo.map(
            (c, i) => {
                return {
                    id: i.toString(),
                    name:
                        c.columnName === "Microsoft SQL Server 2005 XML Showplan"
                            ? locConstants.queryResult.showplanXML
                            : escape(c.columnName),
                    field: i.toString(),
                    formatter:
                        c.isXml || c.isJson
                            ? hyperLinkFormatter
                            : (
                                  row: number | undefined,
                                  cell: any | undefined,
                                  value: DbCellValue,
                                  columnDef: any | undefined,
                                  dataContext: any | undefined,
                              ):
                                  | string
                                  | {
                                        text: string;
                                        addClasses: string;
                                    } => {
                                  if (isXmlCell(value, context?.log) && props.resultSetSummary) {
                                      props.resultSetSummary.columnInfo[i].isXml = true;
                                      return hyperLinkFormatter(
                                          row,
                                          cell,
                                          value,
                                          columnDef,
                                          dataContext,
                                      );
                                  } else if (isJsonCell(value) && props.resultSetSummary) {
                                      //TODO use showJsonAsLink config
                                      props.resultSetSummary.columnInfo[i].isJson = true;
                                      return hyperLinkFormatter(
                                          row,
                                          cell,
                                          value,
                                          columnDef,
                                          dataContext,
                                      );
                                  } else {
                                      return textFormatter(
                                          row,
                                          cell,
                                          value,
                                          columnDef,
                                          dataContext,
                                          DBCellValue.isDBCellValue(value) && value.isNull
                                              ? NULL_CELL_CSS_CLASS
                                              : undefined,
                                      );
                                  }
                              },
                };
            },
        );

        let div = document.createElement("div");
        div.id = "grid";
        div.className = "grid-panel";
        div.style.display = "inline-block";

        let tableOptions: Slick.GridOptions<Slick.SlickData> = {
            rowHeight: ROW_HEIGHT,
            showRowNumber: true,
            forceFitColumns: false,
            defaultColumnWidth: COLUMN_WIDTH,
        };
        let rowNumberColumn = new RowNumberColumn<Slick.SlickData>({
            autoCellSelection: false,
        });
        columns.unshift(rowNumberColumn.getColumnDefinition());

        let collection = new VirtualizedCollection<any>(
            50,
            (_index) => {},
            props.resultSetSummary?.rowCount ?? 0,
            props.loadFunc,
        );

        let dataProvider = new HybridDataProvider(
            collection,
            (_startIndex, _count) => {
                if (props.resultSetSummary?.rowCount && props.resultSetSummary?.rowCount > 0) {
                    return props.loadFunc(_startIndex, _count);
                } else {
                    console.info(`No rows to load: start index: ${_startIndex}, count: ${_count}`);
                    return Promise.resolve([]);
                }
            },
            (data: DbCellValue) => {
                if (!data || data.isNull) {
                    return undefined;
                }
                // If the string only contains whitespaces, it will be treated as empty string to make the filtering easier.
                // Note: this is the display string and does not impact the export/copy features.
                return data.displayValue.trim() === "" ? "" : data.displayValue;
            },
            {
                inMemoryDataProcessing: true,
                inMemoryDataCountThreshold: context.state.inMemoryDataProcessingThreshold,
            },
            undefined,
            undefined,
        );
        tableRef.current = new Table(
            div,
            defaultTableStyles,
            props.uri!,
            props.resultSetSummary!,
            props.webViewState!,
            context,
            props.linkHandler!,
            props.gridId,
            { dataProvider: dataProvider, columns: columns },
            tableOptions,
            props.gridParentRef,
            handleContextMenu,
            handleHeaderFilter,
        );
        void setupState();
        collection.setCollectionChangedCallback((startIndex, count) => {
            let refreshedRows = range(startIndex, startIndex + count);
            if (tableRef.current) {
                tableRef.current.invalidateRows(refreshedRows, true);
            }
        });
        if (tableRef.current) {
            tableRef.current.updateRowCount();
        }
        gridContainerRef.current?.appendChild(div);
        if (
            props.gridParentRef &&
            props.gridParentRef.current &&
            props.gridParentRef.current.clientWidth &&
            tableRef.current
        ) {
            tableRef.current.layout(
                new DOM.Dimension(
                    props.gridParentRef.current.clientWidth - ACTIONBAR_WIDTH_PX,
                    props.gridParentRef.current.clientHeight,
                ),
            );
        }
    };

    useImperativeHandle(ref, () => ({
        refreshGrid,
        resizeGrid,
        hideGrid,
        showGrid,
    }));

    useEffect(() => {
        createTable();
    }, [refreshKey]);

    return (
        <>
            <div id="gridContainter" ref={gridContainerRef}></div>
            {contextMenuPosition && (
                <Menu
                    open={isContextMenuOpen}
                    onOpenChange={(_e, data) => {
                        if (!data.open) {
                            handleMenuClose();
                        }
                    }}>
                    <MenuTrigger>
                        <div
                            style={{
                                position: "fixed",
                                left: contextMenuPosition.x,
                                top: contextMenuPosition.y,
                                width: 1,
                                height: 1,
                                pointerEvents: "none",
                            }}
                        />
                    </MenuTrigger>
                    <MenuPopover>
                        <MenuList>
                            <MenuItem
                                onClick={(e) => {
                                    e.stopPropagation();
                                    void handleMenuItemClick("select-all");
                                }}>
                                {locConstants.queryResult.selectAll}
                            </MenuItem>
                            <MenuItem
                                onClick={(e) => {
                                    e.stopPropagation();
                                    void handleMenuItemClick("copy");
                                }}>
                                {locConstants.queryResult.copy}
                            </MenuItem>
                            <MenuItem
                                onClick={(e) => {
                                    e.stopPropagation();
                                    void handleMenuItemClick("copy-with-headers");
                                }}>
                                {locConstants.queryResult.copyWithHeaders}
                            </MenuItem>
                            <MenuItem
                                onClick={(e) => {
                                    e.stopPropagation();
                                    void handleMenuItemClick("copy-headers");
                                }}>
                                {locConstants.queryResult.copyHeaders}
                            </MenuItem>
                            <Menu>
                                <MenuTrigger disableButtonEnhancement>
                                    <MenuItem>Copy as</MenuItem>
                                </MenuTrigger>
                                <MenuPopover>
                                    <MenuList>
                                        <MenuItem
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                void handleMenuItemClick("copy-as-csv");
                                            }}>
                                            CSV
                                        </MenuItem>
                                        <MenuItem
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                void handleMenuItemClick("copy-as-json");
                                            }}>
                                            JSON
                                        </MenuItem>
                                    </MenuList>
                                </MenuPopover>
                            </Menu>
                        </MenuList>
                    </MenuPopover>
                </Menu>
            )}

            {/* Header Filter Popup */}
            {headerFilterPosition && (
                <Popover
                    open={isHeaderFilterOpen}
                    onOpenChange={(_e, data) => {
                        if (!data.open) {
                            handleHeaderFilterClose();
                        }
                    }}>
                    <PopoverTrigger>
                        <div
                            style={{
                                position: "fixed",
                                left: headerFilterPosition.x,
                                top: headerFilterPosition.y,
                                width: 1,
                                height: 1,
                                pointerEvents: "none",
                            }}
                        />
                    </PopoverTrigger>
                    <PopoverSurface className={styles.filterPopover}>
                        <div className={styles.filterContainer}>
                            <Field size="small">
                                <Input
                                    placeholder={locConstants.queryResult.search}
                                    value={searchTerm}
                                    onChange={(_e, data) => handleFilterSearch(data.value)}
                                />
                            </Field>

                            <div className={styles.selectAllContainer}>
                                <Checkbox
                                    size="medium"
                                    checked={
                                        filteredData.length > 0 &&
                                        filteredData.every((item) =>
                                            selectedFilters.has(item.value),
                                        )
                                    }
                                    onChange={(_e, data) => handleSelectAll(data.checked === true)}
                                    label={
                                        <Text weight="semibold">
                                            Select All ({selectedFilters.size}/{filteredData.length}
                                            )
                                        </Text>
                                    }
                                />
                            </div>

                            <div className={styles.filterList}>
                                {renderFilterList(
                                    filteredData,
                                    selectedItems,
                                    handleSelectionChange,
                                )}
                            </div>

                            <div className={styles.filterButtons}>
                                <Button
                                    size="small"
                                    appearance="secondary"
                                    onClick={handleHeaderFilterClear}>
                                    {locConstants.queryResult.clear}
                                </Button>
                                <Button
                                    size="small"
                                    appearance="secondary"
                                    onClick={handleHeaderFilterClose}>
                                    {locConstants.queryResult.close}
                                </Button>
                                <Button
                                    size="small"
                                    appearance="primary"
                                    onClick={handleHeaderFilterApply}>
                                    {locConstants.queryResult.apply}
                                </Button>
                            </div>
                        </div>
                    </PopoverSurface>
                </Popover>
            )}
        </>
    );
});

function isJsonCell(value: DbCellValue): boolean {
    return !!(value && !value.isNull && value.displayValue?.match(IsJsonRegex));
}

function isXmlCell(value: DBCellValue, log?: LogCallback): boolean {
    let isXML = false;
    try {
        if (value && !value.isNull && value.displayValue.trim() !== "") {
            var parser = new DOMParser();
            // Script elements if any are not evaluated during parsing
            var doc = parser.parseFromString(value.displayValue, "text/xml");
            // For non-xmls, parsererror element is present in body element.
            var parserErrors = doc.body?.getElementsByTagName("parsererror") ?? [];
            isXML = parserErrors?.length === 0;
        }
    } catch (e) {
        // Ignore errors when parsing cell content, log and continue
        log && log(`An error occurred when parsing data as XML: ${e}`); // only call if callback is defined
    }
    return isXML;
}

// The regex to check whether a string is a valid JSON string. It is used to determine:
// 1. whether the cell should be rendered as a hyperlink.
// 2. when user clicks a cell, whether the cell content should be displayed in a new text editor as json.
// Based on the requirements, the solution doesn't need to be very accurate, a simple regex is enough since it is more
// performant than trying to parse the string to object.
// Regex explaination: after removing the trailing whitespaces and line breaks, the string must start with '[' (to support arrays)
// or '{', and there must be a '}' or ']' to close it.
const IsJsonRegex = /^\s*[\{|\[][\S\s]*[\}\]]\s*$/g;

// The css class for null cell
const NULL_CELL_CSS_CLASS = "cell-null";

ResultGrid.displayName = "ResultGrid";
export default ResultGrid;
