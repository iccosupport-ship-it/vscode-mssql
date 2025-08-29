/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PropsWithChildren, useCallback, useEffect, useMemo, useState } from "react";
import {
    Menu,
    MenuList,
    MenuItem,
    MenuPopover,
    MenuDivider,
    type PositioningVirtualElement,
} from "@fluentui/react-components";
import {
    ContextMenuItem,
    registerContextMenuHandlers,
    unregisterContextMenuHandlers,
} from "../../../common/contextMenuBus";

interface ActiveMenuState {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onAction: (id: string) => void;
}

export function ContextMenuProvider({ children }: PropsWithChildren<{}>) {
    const [menu, setMenu] = useState<ActiveMenuState | null>(null);
    const [open, setOpen] = useState(false);

    const virtualTarget: PositioningVirtualElement | undefined = useMemo(() => {
        if (!menu) return undefined;
        const rect = () => new DOMRect(menu.x, menu.y, 0, 0);
        return {
            getBoundingClientRect: rect,
            getClientRects: () => ({ length: 1, item: () => rect() as any, 0: rect() }) as any,
        } as PositioningVirtualElement;
    }, [menu]);

    const show = useCallback((opts: ActiveMenuState) => {
        setMenu(opts);
        setOpen(true);
    }, []);
    const hide = useCallback(() => {
        setOpen(false);
        setMenu(null);
    }, []);

    useEffect(() => {
        registerContextMenuHandlers(show, hide);
        return () => unregisterContextMenuHandlers();
    }, [show, hide]);

    // Close on Escape key
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") hide();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [hide]);

    return (
        <>
            {children}
            {menu && virtualTarget && (
                <Menu
                    open={open}
                    onOpenChange={(_, data) => {
                        if (!data.open) hide();
                    }}
                    positioning={{
                        target: virtualTarget,
                        position: "below",
                        align: "start",
                        offset: 4,
                        overflowBoundary: document.body,
                        autoSize: true,
                    }}>
                    <MenuPopover>
                        <MenuList>
                            {menu.items.map((item, idx) =>
                                item.kind === "divider" ? (
                                    <MenuDivider key={`div-${idx}`} />
                                ) : (
                                    <MenuItem
                                        key={item.id}
                                        onClick={() => {
                                            menu.onAction(item.id);
                                            hide();
                                        }}>
                                        {item.label}
                                    </MenuItem>
                                ),
                            )}
                        </MenuList>
                    </MenuPopover>
                </Menu>
            )}
        </>
    );
}
