/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotificationType, RequestType } from "vscode-jsonrpc/browser";
import { PasswordChangeResult } from "../models/contracts/passwordChange";

export interface PasswordChangeWebviewState {
    serverDisplayName: string;
    errorNumber?: number;
    errorMessage?: string;
    message?: string;
}

export const ChangePasswordRequestType = new RequestType<string, PasswordChangeResult, void>(
    "passwordChange/changePassword",
);

export const CancelPasswordChangeNotificationParams = new NotificationType<void>(
    "passwordChange/cancelPasswordChange",
);
