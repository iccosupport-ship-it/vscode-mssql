/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from "path";
import * as vscode from "vscode";
import * as Constants from "../constants/constants";
import * as LocalizedConstants from "../constants/locConstants";

export class AddConnectionTreeNode extends vscode.TreeItem {
    constructor() {
        super(
            LocalizedConstants.msgAddConnection,
            vscode.TreeItemCollapsibleState.None,
        );
        this.command = {
            title: LocalizedConstants.msgAddConnection,
            command: Constants.cmdAddObjectExplorer,
        };
        this.iconPath = {
            light: path.join(__dirname, "objectTypes", "add_light.svg"),
            dark: path.join(__dirname, "objectTypes", "add_dark.svg"),
        };
    }
}
