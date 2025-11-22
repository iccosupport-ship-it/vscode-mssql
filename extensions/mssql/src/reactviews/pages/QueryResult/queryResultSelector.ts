/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useContext, useRef } from "react";
import * as qr from "../../../sharedInterfaces/queryResult";
import { QueryResultStateContext } from "./queryResultStateProvider";

export function useQueryResultSelector<T>(
    selector: (state: qr.QueryResultWebviewState) => T,
    equals: (a: T, b: T) => boolean = Object.is,
) {
    const state = useContext(QueryResultStateContext);
    if (!state) {
        throw new Error("useQueryResultSelector must be used within QueryResultStateProvider");
    }
    const selected = selector(state);
    const ref = useRef(selected);

    if (!equals(ref.current as T, selected as T)) {
        ref.current = selected;
    }

    return ref.current as T;
}
