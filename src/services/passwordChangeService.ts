/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { IConnectionInfo } from "vscode-mssql";
import SqlToolsServiceClient from "../languageservice/serviceclient";
import { PasswordChangeWebviewController } from "../controllers/passwordChangeWebviewController";
import VscodeWrapper from "../controllers/vscodeWrapper";
import { ConnectionCredentials } from "../models/connectionCredentials";
import { PasswordChangeRequest, PasswordChangeResult } from "../models/contracts/passwordChange";
import { SqlConnectionError } from "../controllers/connectionManager";

export class PasswordChangeService {
    constructor(
        private _client: SqlToolsServiceClient,
        private _context?: vscode.ExtensionContext,
        private _vscodeWrapper?: VscodeWrapper,
    ) {}

    public async showPasswordChangeDialog(
        credentials: IConnectionInfo,
        error: SqlConnectionError,
    ): Promise<string | undefined> {
        const webview = new PasswordChangeWebviewController(
            this._context,
            this._vscodeWrapper,
            credentials,
            this,
            error,
        );

        await webview.whenWebviewReady();

        webview.revealToForeground();

        try {
            const result = await webview.dialogResult.promise;
            console.log(`Password change result: ${result}`);
            return result;
        } catch (e) {
            return undefined;
        }
    }

    public async setNewPassword(
        credentials: IConnectionInfo,
        newPassword: string,
    ): Promise<PasswordChangeResult> {
        const connectionDetails = ConnectionCredentials.createConnectionDetails(credentials);
        try {
            return await this._client.sendRequest(PasswordChangeRequest.type, {
                ownerUri: `password-change-lol`,
                connection: connectionDetails,
                newPassword: newPassword,
            });
        } catch (error) {
            return { result: false, errorMessage: error.message as string };
        }
    }
}
