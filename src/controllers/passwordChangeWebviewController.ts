/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { IConnectionInfo } from "vscode-mssql";
import {
    CancelPasswordChangeNotificationParams,
    ChangePasswordRequestType,
    PasswordChangeWebviewState,
} from "../sharedInterfaces/passwordChange";
import { ReactWebviewPanelController } from "./reactWebviewPanelController";
import VscodeWrapper from "./vscodeWrapper";
import { getConnectionDisplayString } from "../models/connectionInfo";
import * as LocConstants from "../constants/locConstants";
import { PasswordChangeService } from "../services/passwordChangeService";
import { SqlConnectionError } from "./connectionManager";

export class PasswordChangeWebviewController extends ReactWebviewPanelController<
    PasswordChangeWebviewState,
    {},
    string
> {
    constructor(
        context: vscode.ExtensionContext,
        vscodeWrapper: VscodeWrapper,
        private credentials: IConnectionInfo,
        private passwordChangeService: PasswordChangeService,
        error: SqlConnectionError,
    ) {
        super(
            context,
            vscodeWrapper,
            "passwordChange",
            "passwordChange",
            {
                serverDisplayName: getConnectionDisplayString(credentials),
                errorNumber: error?.errorNumber,
                errorMessage: error?.errorMessage,
                message: error?.message,
            },
            {
                title: LocConstants.Connection.ChangePassword,
                viewColumn: vscode.ViewColumn.Active,
                iconPath: undefined,
                preserveFocus: true,
            },
        );

        this.registerRpcHandlers();
    }

    private registerRpcHandlers(): void {
        this.onRequest(ChangePasswordRequestType, async (newPassword: string) => {
            let result;
            try {
                result = await this.passwordChangeService.setNewPassword(
                    this.credentials,
                    newPassword,
                );
            } catch (error) {
                result = { error: error.message };
            }
            if (result.result) {
                this.dialogResult.resolve(newPassword);
                this.panel.dispose();
            }
            return result;
        });

        this.onNotification(CancelPasswordChangeNotificationParams, () => {
            this.panel.dispose();
            this.dialogResult.resolve(undefined);
        });
    }
}
