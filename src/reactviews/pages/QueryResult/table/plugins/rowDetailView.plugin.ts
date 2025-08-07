/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mixin } from "../objects";

// Based on SlickGrid Row Detail View plugin, customized for MSSQL query results with Monaco editor

export interface IRowDetailViewOptions extends Slick.PluginOptions {
    panelRows?: number;
    keyPrefix?: string;
    columnId?: string;
    cssClass?: string;
    expandedClass?: string;
    collapsedClass?: string;
    toolTip?: string;
    collapseAllOnSort?: boolean;
    saveDetailViewOnScroll?: boolean;
    singleRowExpand?: boolean;
    useRowClick?: boolean;
    maxRows?: number;
    loadOnce?: boolean;
    preTemplate?: () => string;
    postTemplate?: () => string;
    process?: (item: any) => string;
}

const defaultOptions: IRowDetailViewOptions = {
    panelRows: 10,
    keyPrefix: "__detail_",
    columnId: "_detail_selector",
    cssClass: "detailView-toggle",
    expandedClass: "expanded",
    collapsedClass: "collapsed",
    toolTip: "Click to expand/collapse row details",
    collapseAllOnSort: true,
    saveDetailViewOnScroll: true,
    singleRowExpand: false,
    useRowClick: false,
    maxRows: 100,
};

export class RowDetailView<T extends Slick.SlickData> implements Slick.Plugin<T> {
    public pluginName = "RowDetailView";

    private _grid!: Slick.Grid<T>;
    private _options: IRowDetailViewOptions;
    private _handler = new Slick.EventHandler();
    private _expandedRows: number[] = [];
    private _keyPrefix: string;
    private _dataViewIdProperty = "id";
    private _positionObserver?: MutationObserver;

    // Events
    public onAsyncResponse = new Slick.Event<{ item: T; detailView?: string }>();
    public onAsyncEndUpdate = new Slick.Event<{ item: T; detailView?: string }>();
    public onAfterRowDetailToggle = new Slick.Event<{ item: T; expandedRows: number[] }>();
    public onBeforeRowDetailToggle = new Slick.Event<{ item: T }>();
    public onRowBackToViewportRange = new Slick.Event<{
        item: T;
        rowId: number;
        rowIndex: number;
        expandedRows: number[];
        rowIdsOutOfViewport: number[];
    }>();
    public onRowOutOfViewportRange = new Slick.Event<{
        item: T;
        rowId: number;
        rowIndex: number;
        expandedRows: number[];
        rowIdsOutOfViewport: number[];
    }>();

    constructor(options?: IRowDetailViewOptions) {
        this._options = mixin(options, defaultOptions, false);
        this._keyPrefix = this._options.keyPrefix!;
    }

    public init(grid: Slick.Grid<T>): void {
        this._grid = grid;

        this._handler
            .subscribe(this._grid.onClick, (e: Event, args: Slick.OnClickEventArgs<T>) =>
                this.handleClick(e, args),
            )
            .subscribe(this._grid.onSort, () => this.handleSort())
            .subscribe(this._grid.onColumnsResized, () => this.resizeDetailView())
            .subscribe(this._grid.onScroll, () => this.handleScroll());

        // Add CSS for expand/collapse icons
        this.addRowDetailStyles();
    }

    public destroy(): void {
        this._handler.unsubscribeAll();
        const styleElement = document.getElementById("row-detail-styles");
        if (styleElement) {
            styleElement.remove();
        }
        if (this._positionObserver) {
            this._positionObserver.disconnect();
            this._positionObserver = undefined;
        }
    }

    public getColumnDefinition(): Slick.Column<T> {
        return {
            id: this._options.columnId!,
            name: "",
            field: "sel",
            width: 30,
            resizable: false,
            sortable: false,
            cssClass: this._options.cssClass,
            formatter: this.detailSelectionFormatter.bind(this),
        };
    }

    private addRowDetailStyles(): void {
        if (!document.getElementById("row-detail-styles")) {
            const style = document.createElement("style");
            style.id = "row-detail-styles";
            style.innerHTML = `
.detailView-toggle {
    cursor: pointer;
    padding: 5px;
    text-align: center;
    font-size: 12px;
    user-select: none;
}
.detailView-toggle.collapsed:before {
    content: "▶";
    color: var(--vscode-foreground);
}
.detailView-toggle.expanded:before {
    content: "▼";
    color: var(--vscode-foreground);
}
.slick-row-detail {
    position: absolute !important;
    width: 100% !important;
    background: var(--vscode-editor-background) !important;
    border: 1px solid var(--vscode-widget-border) !important;
    border-top: none !important;
    z-index: 999 !important;
    display: block !important;
    left: 0px !important;
    overflow: scroll;
}
.slick-row-detail-container {
    background: var(--vscode-editor-background);
    border: none;
    padding: 0;
    margin: 0;
    width: 100%;
    height: 100%;
}
.detail-text-container {
    height: 220px;
    width: 100%;
    border: 1px solid var(--vscode-widget-border);
    overflow: auto;
}
.detail-header {
    background: var(--vscode-titleBar-activeBackground);
    color: var(--vscode-titleBar-activeForeground);
    padding: 8px 12px;
    font-weight: bold;
    border-bottom: 1px solid var(--vscode-widget-border);
}
.row-number-clickable {
    cursor: pointer;
    color: var(--vscode-textLink-foreground);
}
.row-number-clickable:hover {
    color: var(--vscode-textLink-activeForeground);
    text-decoration: underline;
}
`;
            document.head.appendChild(style);
        }
    }

    private detailSelectionFormatter(row: number): string {
        const isExpanded = this._expandedRows.indexOf(row) >= 0;
        const cssClass = isExpanded ? this._options.expandedClass : this._options.collapsedClass;
        return `<div class="${this._options.cssClass} ${cssClass}" title="${this._options.toolTip}"></div>`;
    }

    public expandRow(row: number, content: string, title: string = "Row Details"): void {
        if (this._expandedRows.indexOf(row) >= 0) {
            return; // Already expanded
        }

        const item = this._grid.getDataItem(row);
        this.onBeforeRowDetailToggle.notify({ item }, null, this);

        if (this._options.singleRowExpand) {
            this.collapseAll();
        }

        this._expandedRows.push(row);
        this.createDetailView(row, content, title);

        this.onAfterRowDetailToggle.notify(
            {
                item,
                expandedRows: this._expandedRows,
            },
            null,
            this,
        );
    }

    public collapseRow(row: number): void {
        const index = this._expandedRows.indexOf(row);
        if (index < 0) {
            return; // Not expanded
        }

        this._expandedRows.splice(index, 1);
        this.removeDetailView(row);

        // Re-render the row to update the toggle icon
        this._grid.invalidateRow(row);
        this._grid.render();
    }

    public collapseAll(): void {
        while (this._expandedRows.length > 0) {
            this.collapseRow(this._expandedRows[0]);
        }
    }

    private handleClick(e: Event, args: Slick.OnClickEventArgs<T>): void {
        const column = this._grid.getColumns()[args.cell];
        console.log("RowDetailView click detected:", args, column);
        if (column && column.id === this._options.columnId) {
            console.log("Row detail toggle clicked");
            // Toggle detail view
            if (this._expandedRows.indexOf(args.row) >= 0) {
                console.log("Collapsing row:", args.row);
                this.collapseRow(args.row);
            } else {
                console.log("Expanding row:", args.row);
                // Let the parent component handle the expansion with content
                this.onAsyncResponse.notify(
                    {
                        item: this._grid.getDataItem(args.row),
                    },
                    null,
                    this,
                );
            }
            e.stopPropagation();
        }
    }

    private handleSort(): void {
        if (this._options.collapseAllOnSort) {
            this.collapseAll();
        }
    }

    private handleScroll(): void {
        // Handle viewport changes - ensure detail rows are properly positioned
        const viewport = this._grid.getViewport();
        console.log("Scroll event - viewport:", viewport);

        // Update positions of detail rows based on current viewport
        this.updateDetailRowsForViewport();
    }

    private findRowElement(rowIndex: number): HTMLElement | null {
        const containerNode = this._grid.getContainerNode();
        const allRows = containerNode.querySelectorAll(".slick-row:not(.slick-row-detail)");

        for (const rowElement of allRows) {
            const htmlElement = rowElement as HTMLElement;
            const ariaRowIndex = htmlElement.getAttribute("aria-rowindex");
            if (ariaRowIndex && parseInt(ariaRowIndex, 10) === rowIndex + 1) {
                // aria-rowindex is 1-based
                return htmlElement;
            }
        }

        console.log(`Could not find row element for row ${rowIndex}`);
        return null;
    }

    private shiftRowsDown(fromRow: number, shiftAmount: number): void {
        console.log(`Shifting rows from ${fromRow} down by ${shiftAmount}px`);

        const containerNode = this._grid.getContainerNode();
        const allRows = containerNode.querySelectorAll(".slick-row:not(.slick-row-detail)");

        console.log(`Found ${allRows.length} rows to potentially shift`);

        allRows.forEach((rowElement) => {
            const htmlElement = rowElement as HTMLElement;
            const ariaRowIndex = htmlElement.getAttribute("aria-rowindex");
            if (ariaRowIndex) {
                const rowIndex = parseInt(ariaRowIndex, 10) - 1; // Convert to 0-based
                const currentTop = parseInt(htmlElement.style.top || "0", 10);

                console.log(
                    `Row ${rowIndex} (aria-rowindex=${ariaRowIndex}): currentTop=${currentTop}px, fromRow=${fromRow}`,
                );

                if (rowIndex >= fromRow) {
                    const newTop = currentTop + shiftAmount;
                    htmlElement.style.top = `${newTop}px`;
                    console.log(`✓ Shifted row ${rowIndex} from ${currentTop}px to ${newTop}px`);
                } else {
                    console.log(`- Skipping row ${rowIndex} (before fromRow ${fromRow})`);
                }
            } else {
                console.log(`Row without aria-rowindex found:`, htmlElement);
            }
        });
    }

    private shiftRowsUp(fromRow: number, shiftAmount: number): void {
        console.log(`Shifting rows from ${fromRow} up by ${shiftAmount}px`);

        const containerNode = this._grid.getContainerNode();
        const allRows = containerNode.querySelectorAll(".slick-row:not(.slick-row-detail)");

        allRows.forEach((rowElement) => {
            const htmlElement = rowElement as HTMLElement;
            const ariaRowIndex = htmlElement.getAttribute("aria-rowindex");
            if (ariaRowIndex) {
                const rowIndex = parseInt(ariaRowIndex, 10) - 1; // Convert to 0-based
                if (rowIndex >= fromRow) {
                    const currentTop = parseInt(htmlElement.style.top || "0", 10);
                    const newTop = currentTop - shiftAmount;
                    htmlElement.style.top = `${newTop}px`;
                    console.log(`Shifted row ${rowIndex} from ${currentTop}px to ${newTop}px`);
                }
            }
        });
    }

    private adjustCanvasHeight(heightChange: number): void {
        const containerNode = this._grid.getContainerNode();
        const canvas = containerNode.querySelector(".grid-canvas") as HTMLElement;
        if (canvas) {
            const currentHeight = parseInt(canvas.style.height || "0", 10) || canvas.clientHeight;
            const newHeight = currentHeight + heightChange;
            canvas.style.height = `${newHeight}px`;
            console.log(`Adjusted canvas height from ${currentHeight}px to ${newHeight}px`);

            // Tell SlickGrid the canvas size changed
            this._grid.resizeCanvas();
        }
    }

    private updateDetailRowsForViewport(): void {
        // For viewport updates, we need to maintain our row shifts
        console.log("Viewport updated - reapplying row position adjustments");
        this.maintainRowPositions();
    }

    private setupRowPositionPersistence(): void {
        // Set up a mutation observer to watch for changes to row positions
        if (!this._positionObserver) {
            const containerNode = this._grid.getContainerNode();
            const canvas = containerNode.querySelector(".grid-canvas") as HTMLElement;

            if (canvas) {
                this._positionObserver = new MutationObserver((mutations) => {
                    let shouldReapply = false;

                    mutations.forEach((mutation) => {
                        if (
                            mutation.type === "childList" ||
                            (mutation.type === "attributes" && mutation.attributeName === "style")
                        ) {
                            shouldReapply = true;
                        }
                    });

                    if (shouldReapply && this._expandedRows.length > 0) {
                        console.log("Row positions changed, reapplying adjustments");
                        setTimeout(() => this.maintainRowPositions(), 0);
                    }
                });

                this._positionObserver.observe(canvas, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ["style"],
                });
            }
        }
    }

    private maintainRowPositions(): void {
        if (this._expandedRows.length === 0) return;

        console.log("Maintaining row positions for expanded rows:", this._expandedRows);

        // For each expanded row, ensure subsequent rows are properly shifted
        const sortedExpandedRows = this._expandedRows.slice().sort((a, b) => a - b);
        const detailRowHeight = this._options.panelRows! * 30;

        sortedExpandedRows.forEach((expandedRow, index) => {
            // Calculate the cumulative shift needed for this expansion
            const cumulativeShift = (index + 1) * detailRowHeight;
            const baseFromRow = expandedRow + 1;

            this.reapplyRowShift(baseFromRow, expandedRow, cumulativeShift);
        });
    }

    private reapplyRowShift(fromRow: number, expandedRow: number, totalShiftNeeded: number): void {
        const containerNode = this._grid.getContainerNode();
        const allRows = containerNode.querySelectorAll(".slick-row:not(.slick-row-detail)");
        const rowHeight = this._grid.getOptions().rowHeight || 25;

        allRows.forEach((rowElement) => {
            const htmlElement = rowElement as HTMLElement;
            const ariaRowIndex = htmlElement.getAttribute("aria-rowindex");
            if (ariaRowIndex) {
                const rowIndex = parseInt(ariaRowIndex, 10) - 1;

                if (rowIndex >= fromRow) {
                    // Calculate what this row's position should be
                    const basePosition = rowIndex * rowHeight;
                    const expectedPosition = basePosition + totalShiftNeeded;
                    const currentTop = parseInt(htmlElement.style.top || "0", 10);

                    if (currentTop !== expectedPosition) {
                        htmlElement.style.top = `${expectedPosition}px`;
                        console.log(
                            `Reapplied shift: row ${rowIndex} from ${currentTop}px to ${expectedPosition}px`,
                        );
                    }
                }
            }
        });
    }

    private resizeDetailView(): void {
        // Resize detail views to match grid width
        this._expandedRows.forEach((row) => {
            const detailContainer = document.getElementById(`detail-container-${row}`);
            if (detailContainer) {
                const gridWidth = this._grid.getContainerNode().clientWidth;
                detailContainer.style.width = `${gridWidth - 50}px`;
            }
        });
    }

    private createDetailView(row: number, content: string, title: string): void {
        console.log("createDetailView called for row:", row);
        // Create detail view container
        const containerId = `detail-container-${row}`;
        const detailViewHtml = `
            <div id="${containerId}" class="slick-row-detail-container">
                <div class="detail-header">${title}</div>
                <div class="detail-text-container" id="text-${row}"></div>
            </div>
        `;

        console.log("Detail view HTML created, scheduling insertion");
        // Insert the detail row
        setTimeout(() => {
            console.log("Executing insertDetailRowAfter");
            this.insertDetailRowAfter(row, detailViewHtml, content);
        }, 0);
    }

    private insertDetailRowAfter(row: number, detailViewHtml: string, content: string): void {
        console.log("insertDetailRowAfter called for row:", row);

        const containerNode = this._grid.getContainerNode();
        const canvas = containerNode.querySelector(".grid-canvas") as HTMLElement;
        if (!canvas) {
            console.error("Could not find grid canvas");
            return;
        }

        // Find the actual row element in the DOM
        const viewport = this._grid.getViewport();
        const rowElement = this.findRowElement(row);

        if (!rowElement) {
            console.error("Could not find row element for row:", row);
            return;
        }

        const detailRowElement = document.createElement("div");
        detailRowElement.className = "slick-row slick-row-detail";
        detailRowElement.innerHTML = detailViewHtml;
        detailRowElement.setAttribute("data-detail-row", row.toString());

        // Calculate positioning
        const detailHeight = this._options.panelRows! * 30;
        const rowHeight = this._grid.getOptions().rowHeight || 25;

        // Position the detail row right after the parent row
        const parentTop = parseInt(rowElement.style.top || "0", 10);
        const detailTop = parentTop + rowHeight;

        // Style the detail row
        detailRowElement.style.position = "absolute";
        detailRowElement.style.top = `${detailTop}px`;
        detailRowElement.style.left = "0px";
        detailRowElement.style.height = `${detailHeight}px`;
        detailRowElement.style.width = "100%";
        detailRowElement.style.backgroundColor = "var(--vscode-editor-background)";
        detailRowElement.style.border = "1px solid var(--vscode-widget-border)";
        detailRowElement.style.borderTop = "none";
        detailRowElement.style.zIndex = "999";

        console.log(`Created detail row element at top: ${detailTop}px, height: ${detailHeight}px`);

        // Insert the detail row into the canvas
        canvas.appendChild(detailRowElement);
        console.log("Inserted detail row element into grid canvas");

        // Initialize text editor in the container
        console.log("Initializing text editor for text-" + row);
        this.initializeTextEditor(`text-${row}`, content);

        // Update canvas height first
        this.adjustCanvasHeight(detailHeight);

        // Update the toggle icon for this specific row
        this._grid.invalidateRow(row);
        this._grid.render();

        // Shift rows after a short delay and then persist the changes
        setTimeout(() => {
            console.log("Executing delayed row shift");
            this.shiftRowsDown(row + 1, detailHeight);

            // Set up persistent row position monitoring
            this.setupRowPositionPersistence();
        }, 10);

        console.log("Updated grid render and layout");
    }

    private removeDetailView(row: number): void {
        const containerNode = this._grid.getContainerNode();
        const detailRowElement = containerNode.querySelector(
            `[data-detail-row="${row}"]`,
        ) as HTMLElement;

        if (detailRowElement) {
            const detailHeight =
                parseInt(detailRowElement.style.height, 10) || this._options.panelRows! * 30;

            // Remove the detail row element
            detailRowElement.remove();

            // Shift all rows that come after this row up by the detail height
            this.shiftRowsUp(row + 1, detailHeight);

            // Update canvas height
            this.adjustCanvasHeight(-detailHeight);

            // Update the toggle icon for this row
            this._grid.invalidateRow(row);
            this._grid.render();

            console.log(`Removed detail row for row ${row} with height ${detailHeight}px`);
        } else {
            console.warn(`Could not find detail row element for row ${row}`);
        }
    }

    private initializeTextEditor(containerId: string, content: string): void {
        console.log(
            "initializeTextEditor called for container:",
            containerId,
            "content length:",
            content.length,
        );
        const container = document.getElementById(containerId);
        console.log("Found container element:", container);
        if (!container) {
            console.error("Container not found for ID:", containerId);
            return;
        }

        // Create a simple textarea for the content
        const textarea = document.createElement("textarea");
        textarea.value = content;
        textarea.readOnly = true;
        textarea.style.width = "100%";
        textarea.style.height = "200px";
        textarea.style.border = "none";
        textarea.style.outline = "none";
        textarea.style.resize = "none";
        textarea.style.padding = "10px";
        textarea.style.fontFamily = 'Consolas, "Courier New", monospace';
        textarea.style.fontSize = "12px";
        textarea.style.lineHeight = "1.4";
        textarea.style.backgroundColor = "var(--vscode-editor-background)";
        textarea.style.color = "var(--vscode-editor-foreground)";
        textarea.style.whiteSpace = "pre";
        textarea.style.overflowWrap = "normal";
        textarea.style.overflow = "auto";

        console.log("Created textarea with styles, adding to container");
        // Clear container and add textarea
        container.innerHTML = "";
        container.appendChild(textarea);
        console.log("Text editor initialized successfully");
    }

    public getExpandedRows(): number[] {
        return this._expandedRows;
    }
}
