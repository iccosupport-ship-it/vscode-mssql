/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { IConnectionInfo } from "vscode-mssql";
import {
    ChangePasswordRequestType,
    PasswordChangeWebviewState,
} from "../sharedInterfaces/passwordChange";
import { ReactWebviewPanelController } from "./reactWebviewPanelController";
import VscodeWrapper from "./vscodeWrapper";
import { getConnectionDisplayString } from "../models/connectionInfo";
import * as LocConstants from "../constants/locConstants";
import { PasswordChangeService } from "../services/passwordChangeService";

export class PasswordChangeWebviewController extends ReactWebviewPanelController<
    PasswordChangeWebviewState,
    {}
> {
    constructor(
        context: vscode.ExtensionContext,
        vscodeWrapper: VscodeWrapper,
        private credentials: IConnectionInfo,
        private passwordChangeService: PasswordChangeService,
    ) {
        super(
            context,
            vscodeWrapper,
            "passwordChange",
            "passwordChange",
            {
                serverDisplayName: getConnectionDisplayString(credentials),
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
            return await this.passwordChangeService.setNewPassword(this.credentials, newPassword);
        });
    }
}
