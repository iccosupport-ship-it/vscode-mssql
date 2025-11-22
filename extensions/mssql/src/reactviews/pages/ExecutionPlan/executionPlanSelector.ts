/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    ExecutionPlanReducers,
    ExecutionPlanWebviewState,
} from "../../../sharedInterfaces/executionPlan";
import { useContext, useRef } from "react";
import { useVscodeSelector } from "../../common/useVscodeSelector";
import { ExecutionPlanStateOverrideContext } from "./executionPlanStateProvider";

export function useExecutionPlanSelector<T>(
    selector: (state: ExecutionPlanWebviewState) => T,
    equals: (a: T, b: T) => boolean = Object.is,
) {
    const overrideState = useContext(ExecutionPlanStateOverrideContext);
    if (overrideState) {
        const selected = selector(overrideState);
        const ref = useRef(selected);
        if (!equals(ref.current as T, selected as T)) {
            ref.current = selected;
        }
        return ref.current as T;
    }
    return useVscodeSelector<ExecutionPlanWebviewState, ExecutionPlanReducers, T>(selector, equals);
}
