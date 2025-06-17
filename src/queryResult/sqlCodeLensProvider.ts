/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import * as Constants from "../constants/constants";
import ConnectionManager from "../controllers/connectionManager";
import { generateDatabaseDisplayName, generateServerDisplayName } from "../models/connectionInfo";

export class SqlCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
    private _disposables: vscode.Disposable[] = [];
    private _codeLensChangedEmitter = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses?: vscode.Event<void> = this._codeLensChangedEmitter.event;

    constructor(private _connectionManager: ConnectionManager) {
        this._disposables.push(
            this._connectionManager.onConnectionsChanged(() => {
                this._codeLensChangedEmitter.fire();
            }),
        );
    }

    public provideCodeLenses(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken,
    ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        const shouldShowActiveConnection = vscode.workspace
            .getConfiguration()
            .get<boolean>(Constants.configShowActiveConnectionAsCodeLensSuggestion);
        if (!shouldShowActiveConnection) {
            return [];
        }

        const stringifiedUri = document.uri.toString(true);

        const isConnecting = this._connectionManager.isConnecting(stringifiedUri);
        const isConnected = this._connectionManager.isConnected(stringifiedUri);
        const statusBar = this._connectionManager.statusView.getStatusBar(
            document.uri.toString(true),
        );
        const connection = this._connectionManager.getConnectionInfo(document.uri.toString(true));
        if (isConnecting) {
            return [
                new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
                    title: statusBar.statusConnection.text,
                    command: Constants.cmdDisconnect,
                    tooltip: statusBar.statusConnection.tooltip.toString(),
                }),
            ];
        }
        if (!isConnected) {
            return [
                new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
                    title: statusBar.statusConnection.text,
                    command: Constants.cmdConnect,
                    tooltip: statusBar.statusConnection.tooltip.toString(),
                }),
            ];
        }

        const items = [
            new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
                title: generateServerDisplayName(connection.credentials),
                command: Constants.cmdConnect,
                tooltip: statusBar.statusConnection.tooltip.toString(),
            }),

            new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
                title: generateDatabaseDisplayName(connection.credentials),
                command: Constants.cmdChooseDatabase,
            }),
        ];
        return items;
    }

    public resolveCodeLens?(
        _codeLens: vscode.CodeLens,
        _token: vscode.CancellationToken,
    ): vscode.CodeLens | Thenable<vscode.CodeLens> {
        return undefined;
    }

    public dispose(): void {
        this._disposables.forEach((d) => d.dispose());
        this._disposables = [];
    }
}
