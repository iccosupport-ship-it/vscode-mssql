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
import { generateGuid } from "../models/utils";

export class PasswordChangeService {
    constructor(
        private _client: SqlToolsServiceClient,
        private _context?: vscode.ExtensionContext,
        private _vscodeWrapper?: VscodeWrapper,
    ) {}

    public async showPasswordChangeDialog(credentials: IConnectionInfo): Promise<boolean> {
        const webview = new PasswordChangeWebviewController(
            this._context,
            this._vscodeWrapper,
            credentials,
            this,
        );

        await webview.whenWebviewReady();

        try {
            const result = await webview.dialogResult.promise;
            return true;
        } catch (e) {
            return false;
        }
    }

    public async setNewPassword(
        credentials: IConnectionInfo,
        newPassword: string,
    ): Promise<PasswordChangeResult> {
        const connectionDetails = ConnectionCredentials.createConnectionDetails(credentials);
        return await this._client.sendRequest(PasswordChangeRequest.type, {
            ownerUri: `passwordChange_${generateGuid()}`,
            connection: connectionDetails,
            newPassword: newPassword,
        });
    }
}
