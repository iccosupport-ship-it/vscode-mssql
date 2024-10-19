/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { create } from "zustand";
import { Draft, produce } from "immer";

export const useStore = create((set) => ({
    state: {},
    updateState: (state: any) => {
        set(
            produce((draft) => {
                smartUpdateState(draft, state);
            }),
        );
    },
}));

function smartUpdateState(draft: Draft<any>, newState: any) {
    Object.keys(newState).forEach((key) => {
        const currentVal = draft[key];
        const newVal = newState[key];

        if (
            typeof newVal === "object" &&
            newVal !== null &&
            !Array.isArray(newVal)
        ) {
            // If it's a nested object, recurse into it
            if (!currentVal) {
                draft[key] = {}; // Initialize if the current value is undefined
            }
            smartUpdateState(draft[key], newVal);
        } else if (newVal !== currentVal) {
            // Only update if the values differ
            draft[key] = newVal;
        }
    });
}

export function getTypedStore<T>(): {
    state: T;
    updateState: (state: T) => void;
} {
    return useStore() as { state: T; updateState: (state: T) => void };
}
