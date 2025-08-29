/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type ContextMenuItem = { id: string; label: string; kind?: "item" | "divider" };

export interface ShowContextMenuOptions {
    x: number; // clientX
    y: number; // clientY
    items: ContextMenuItem[];
    onAction: (id: string) => void;
}

type ShowHandler = (opts: ShowContextMenuOptions) => void;
type HideHandler = () => void;

let showHandler: ShowHandler | null = null;
let hideHandler: HideHandler | null = null;

export function registerContextMenuHandlers(show: ShowHandler, hide: HideHandler): void {
    showHandler = show;
    hideHandler = hide;
}

export function unregisterContextMenuHandlers(): void {
    showHandler = null;
    hideHandler = null;
}

export function showContextMenuOverlay(opts: ShowContextMenuOptions): void {
    showHandler?.(opts);
}

export function hideContextMenuOverlay(): void {
    hideHandler?.();
}
