/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from "vscode-jsonrpc/browser";
import { PasswordChangeResult } from "../models/contracts/passwordChange";

export interface PasswordChangeWebviewState {
    serverDisplayName: string;
}

export const ChangePasswordRequestType = new RequestType<string, PasswordChangeResult, void>(
    "passwordChange/changePassword",
);
