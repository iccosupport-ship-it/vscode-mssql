/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useMemo, useRef } from "react";
import {
    Menu,
    MenuList,
    MenuItem,
    MenuPopover,
    MenuTrigger,
    makeStyles,
} from "@fluentui/react-components";
import { locConstants } from "../../../../common/locConstants";
import { GridContextMenuAction } from "../../../../../sharedInterfaces/queryResult";
import { useVscodeWebview2 } from "../../../../common/vscodeWebviewProvider2";
import { WebviewAction } from "../../../../../sharedInterfaces/webview";

export interface GridContextMenuProps {
    x: number;
    y: number;
    open: boolean;
    onAction: (action: GridContextMenuAction) => void;
    onClose: () => void;
}

// Virtual element used by Fluent UI positioning to anchor the popover at an arbitrary point
function createVirtualElement(x: number, y: number): { getBoundingClientRect: () => DOMRect } {
    return {
        getBoundingClientRect: () => new DOMRect(x, y, 0, 0),
    };
}

const useStyles = makeStyles({
    popover: {
        minWidth: "110px",
        paddingBlock: "1px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.14)",
        borderRadius: "4px",
    },
    menuList: {
        paddingBlock: "1px",
    },
    menuItem: {
        paddingBlock: "2px",
        paddingInline: "6px",
        minHeight: "20px",
        fontSize: "10px",
        lineHeight: "20px",
        "& .fui-MenuItem__secondaryContent": {
            fontSize: "9px",
            opacity: 0.7,
            lineHeight: "20px",
        },
        "& .fui-MenuItem__content": {
            display: "flex",
            alignItems: "center",
        },
    },
    submenuTrigger: {
        paddingInlineEnd: "14px",
    },
    submenuPopover: {
        minWidth: "110px",
        paddingBlock: "1px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.14)",
        borderRadius: "4px",
    },
    secondary: {
        fontSize: "9px",
        opacity: 0.7,
    },
});

export const GridContextMenu: React.FC<GridContextMenuProps> = ({
    x,
    y,
    open,
    onAction,
    onClose,
}) => {
    const virtualTarget = useMemo(() => createVirtualElement(x, y), [x, y]);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const classes = useStyles();
    const { keyboardShortcuts } = useVscodeWebview2();

    return (
        <div
            // Prevent the browser default context menu if user right-clicks during menu open
            onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
            style={{ position: "fixed", inset: 0, zIndex: 100000 }}>
            <Menu
                open={open}
                positioning={{
                    target: virtualTarget,
                    position: "below",
                    align: "start",
                    offset: 4,
                    overflowBoundary: document.body,
                    flipBoundary: document.body,
                }}
                onOpenChange={(_, data) => {
                    if (!data.open) {
                        onClose();
                    }
                }}>
                <MenuPopover
                    onClick={(e) => e.stopPropagation()}
                    ref={popoverRef}
                    className={classes.popover}>
                    <MenuList className={classes.menuList}>
                        <MenuItem
                            className={classes.menuItem}
                            secondaryContent={
                                keyboardShortcuts[WebviewAction.ResultGridSelectAll]?.label
                            }
                            onClick={() => onAction(GridContextMenuAction.SelectAll)}>
                            {locConstants.queryResult.selectAll}
                        </MenuItem>
                        <MenuItem
                            className={classes.menuItem}
                            secondaryContent={
                                keyboardShortcuts[WebviewAction.ResultGridCopySelection]?.label
                            }
                            onClick={() => onAction(GridContextMenuAction.CopySelection)}>
                            {locConstants.queryResult.copy}
                        </MenuItem>
                        <MenuItem
                            className={classes.menuItem}
                            secondaryContent={
                                keyboardShortcuts[WebviewAction.ResultGridCopyWithHeaders]?.label
                            }
                            onClick={() => onAction(GridContextMenuAction.CopyWithHeaders)}>
                            {locConstants.queryResult.copyWithHeaders}
                        </MenuItem>
                        <MenuItem
                            className={classes.menuItem}
                            secondaryContent={
                                keyboardShortcuts[WebviewAction.ResultGridCopyAllHeaders]?.label
                            }
                            onClick={() => onAction(GridContextMenuAction.CopyHeaders)}>
                            {locConstants.queryResult.copyHeaders}
                        </MenuItem>
                        <Menu>
                            <MenuTrigger disableButtonEnhancement>
                                <MenuItem className={classes.menuItem}>
                                    {locConstants.queryResult.copyAs}
                                </MenuItem>
                            </MenuTrigger>
                            <MenuPopover className={classes.submenuPopover}>
                                <MenuList className={classes.menuList}>
                                    <MenuItem
                                        className={`${classes.menuItem} ${classes.submenuTrigger}`}
                                        secondaryContent={
                                            keyboardShortcuts[WebviewAction.ResultGridCopyAsCsv]
                                                ?.label
                                        }
                                        onClick={() => onAction(GridContextMenuAction.CopyAsCsv)}>
                                        {locConstants.queryResult.copyAsCsv}
                                    </MenuItem>
                                    <MenuItem
                                        className={`${classes.menuItem} ${classes.submenuTrigger}`}
                                        secondaryContent={
                                            keyboardShortcuts[WebviewAction.ResultGridCopyAsJson]
                                                ?.label
                                        }
                                        onClick={() => onAction(GridContextMenuAction.CopyAsJson)}>
                                        {locConstants.queryResult.copyAsJson}
                                    </MenuItem>
                                    <MenuItem
                                        className={`${classes.menuItem} ${classes.submenuTrigger}`}
                                        secondaryContent={
                                            keyboardShortcuts[WebviewAction.ResultGridCopyAsInsert]
                                                ?.label
                                        }
                                        onClick={() =>
                                            onAction(GridContextMenuAction.CopyAsInsertInto)
                                        }>
                                        {locConstants.queryResult.copyAsInsertInto}
                                    </MenuItem>
                                    <MenuItem
                                        className={`${classes.menuItem} ${classes.submenuTrigger}`}
                                        secondaryContent={
                                            keyboardShortcuts[
                                                WebviewAction.ResultGridCopyAsInClause
                                            ]?.label
                                        }
                                        onClick={() =>
                                            onAction(GridContextMenuAction.CopyAsInClause)
                                        }>
                                        {locConstants.queryResult.copyAsInClause}
                                    </MenuItem>
                                </MenuList>
                            </MenuPopover>
                        </Menu>
                    </MenuList>
                </MenuPopover>
            </Menu>
        </div>
    );
};

export default GridContextMenu;
