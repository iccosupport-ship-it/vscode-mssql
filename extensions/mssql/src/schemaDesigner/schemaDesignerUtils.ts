/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { configSchemaDesignerEngine } from "../constants/constants";
import * as LocConstants from "../constants/locConstants";

export enum SchemaDesignerEngine {
    DacFx = "dacfx",
    InMemory = "inMemory",
}

/**
 * Retrieves the configured schema designer engine from VS Code settings.
 * @returns The selected SchemaDesignerEngine enum value.
 */
export function getSchemaDesignerEngineConfig(): SchemaDesignerEngine {
    const config = vscode.workspace.getConfiguration();
    return config.get<SchemaDesignerEngine>(configSchemaDesignerEngine, SchemaDesignerEngine.DacFx);
}

/**
 * Displays a modal warning dialog to the user when they attempt to exit the schema designer with unsaved changes.
 * @returns A promise that resolves to "restore" if the user chooses to restore their session, or "cancel" if they choose to cancel the exit.
 */
export async function showSchemaDesignerExitWarning(): Promise<"restore" | "cancel"> {
    const choice = await vscode.window.showInformationMessage(
        LocConstants.Webview.webviewRestorePrompt(LocConstants.SchemaDesigner.SchemaDesigner),
        { modal: true },
        LocConstants.Webview.Restore,
    );
    return choice === LocConstants.Webview.Restore ? "restore" : "cancel";
}
