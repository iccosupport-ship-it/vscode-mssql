/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const SCROLL_BLOCKING_EVENTS = new Set(["wheel", "touchstart", "touchmove", "mousewheel"]);

/**
 * Normalizes event listener options so scroll-blocking events default to passive=true
 * unless the caller explicitly requests otherwise.
 */
export function resolveEventListenerOptions(
    type: string,
    options?: boolean | AddEventListenerOptions,
): boolean | AddEventListenerOptions {
    const normalizedType = type?.toLowerCase?.() ?? "";

    if (typeof options === "boolean") {
        if (!options && SCROLL_BLOCKING_EVENTS.has(normalizedType)) {
            return { passive: true };
        }
        return options;
    }

    if (options) {
        if (options.passive === undefined && SCROLL_BLOCKING_EVENTS.has(normalizedType)) {
            return { ...options, passive: true };
        }
        return options;
    }

    if (SCROLL_BLOCKING_EVENTS.has(normalizedType)) {
        return { passive: true };
    }

    return false;
}
