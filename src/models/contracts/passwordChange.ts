/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from "vscode-languageclient";
import { ConnectionDetails } from "vscode-mssql";

export interface PasswordChangeParams {
    ownerUri: string;
    connection: ConnectionDetails;
    newPassword: string;
}

export interface PasswordChangeResult {
    result: boolean;
    errorMessage?: string;
    errorNumber?: number;
}

export namespace PasswordChangeRequest {
    export const type = new RequestType<PasswordChangeParams, PasswordChangeResult, void, void>(
        "connection/changepassword",
    );
}
