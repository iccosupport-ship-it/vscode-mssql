/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PasswordChangeWebviewState } from "../../../sharedInterfaces/passwordChange";
import { useVscodeSelector } from "../../common/useVscodeSelector";

export function usePasswordChangeSelector<T>(
    selector: (state: PasswordChangeWebviewState) => T,
    equals: (a: T, b: T) => boolean = Object.is,
) {
    return useVscodeSelector<PasswordChangeWebviewState, {}, T>(selector, equals);
}
