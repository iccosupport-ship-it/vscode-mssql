/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import VscodeWrapper from "../controllers/vscodeWrapper";
import { SchemaDesigner } from "../sharedInterfaces/schemaDesigner";
import { SchemaDesignerWebviewController } from "./schemaDesignerWebviewController";
import { TreeNodeInfo } from "../objectExplorer/nodes/treeNodeInfo";
import MainController from "../controllers/mainController";
import { TelemetryViews, TelemetryActions } from "../sharedInterfaces/telemetry";
import { sendActionEvent } from "../telemetry/telemetry";
import { IConnectionProfile } from "../models/interfaces";
import {
    getSchemaDesignerEngineConfig,
    SchemaDesignerEngine,
    showSchemaDesignerExitWarning,
} from "./schemaDesignerUtils";
import { SchemaDesignerInMemoryService } from "./inMemoryEngine/core/schemaDesignerInMemoryService";
import { SchemaDesignerService } from "../services/schemaDesignerService";
import SqlToolsServiceClient from "../languageservice/serviceclient";
import { MssqlPlatform, VscodeMssqlExecutor } from "./inMemoryEngine/platforms/mssql";

export class SchemaDesignerWebviewManager {
    private static _instance: SchemaDesignerWebviewManager;
    private static _schemaDesignerService: SchemaDesigner.ISchemaDesignerService;
    private _schemaDesigners: Map<string, SchemaDesignerWebviewController> = new Map();
    private _schemaDesignerCache: Map<string, SchemaDesigner.SchemaDesignerCacheItem> = new Map();

    public static getInstance(): SchemaDesignerWebviewManager {
        if (!this._instance) {
            this._instance = new SchemaDesignerWebviewManager();
        }
        return this._instance;
    }

    private constructor() {}

    /**
     * Gets or creates a schema designer webview controller for the specified database connection.
     * This method manages the lifecycle of schema designer instances, reusing existing ones when possible.
     *
     * @param context - The VS Code extension context
     * @param vscodeWrapper - Wrapper for VS Code APIs
     * @param mainController - The main controller instance
     * @param schemaDesignerService - Service for schema designer operations
     * @param databaseName - Name of the database to open in the schema designer
     * @param treeNode - Optional tree node info containing connection profile. If provided, connection details will be extracted from this node
     * @param connectionUri - Optional connection URI. Used when treeNode is not provided to establish database connection
     * @returns Promise that resolves to a SchemaDesignerWebviewController instance
     *
     * @remarks
     * - Either treeNode or connectionUri must be provided to establish a database connection
     */
    public async getSchemaDesigner(
        context: vscode.ExtensionContext,
        vscodeWrapper: VscodeWrapper,
        mainController: MainController,
        databaseName: string,
        treeNode?: TreeNodeInfo,
        connectionUri?: string,
    ): Promise<SchemaDesignerWebviewController> {
        // Update the schema designer service based on current configuration
        SchemaDesignerWebviewManager.updateSchemaDesignerService(mainController);
        let connectionString: string | undefined;
        let azureAccountToken: string | undefined;
        if (treeNode) {
            let connectionInfo = treeNode.connectionProfile;
            connectionInfo = (await mainController.connectionManager.prepareConnectionInfo(
                connectionInfo,
            )) as IConnectionProfile;
            connectionInfo.database = databaseName;

            const connectionDetails =
                await mainController.connectionManager.createConnectionDetails(connectionInfo);

            treeNode.updateConnectionProfile(connectionInfo);

            connectionString = await mainController.connectionManager.getConnectionString(
                connectionDetails,
                true,
                true,
            );
            azureAccountToken = connectionInfo.azureAccountToken;
        } else if (connectionUri) {
            var connInfo = mainController.connectionManager.getConnectionInfo(connectionUri);
            connectionString = await mainController.connectionManager.getConnectionString(
                connectionUri,
                true,
                true,
            );
            azureAccountToken = connInfo.credentials.azureAccountToken;
        }

        const key = `${connectionString}-${databaseName}`;
        if (!this._schemaDesigners.has(key) || this._schemaDesigners.get(key)?.isDisposed) {
            const schemaDesigner = new SchemaDesignerWebviewController(
                context,
                vscodeWrapper,
                mainController,
                SchemaDesignerWebviewManager._schemaDesignerService,
                connectionString,
                azureAccountToken,
                databaseName,
                this._schemaDesignerCache,
                treeNode,
                connectionUri,
            );
            schemaDesigner.onDisposed(async () => {
                this._schemaDesigners.delete(key);
                if (this._schemaDesignerCache.get(key).isDirty) {
                    const choice = await showSchemaDesignerExitWarning();
                    if (choice === "restore") {
                        sendActionEvent(
                            TelemetryViews.WebviewController,
                            TelemetryActions.Restore,
                            {},
                            {},
                        );
                        // Show the webview again
                        await this.getSchemaDesigner(
                            context,
                            vscodeWrapper,
                            mainController,
                            databaseName,
                            treeNode,
                            connectionUri,
                        );
                        return;
                    }
                }
                // Ignoring errors here as we don't want to block the disposal process
                try {
                    SchemaDesignerWebviewManager._schemaDesignerService.disposeSession({
                        sessionId:
                            this._schemaDesignerCache.get(key).schemaDesignerDetails.sessionId,
                    });
                } catch (error) {
                    console.error(`Error disposing schema designer session: ${error}`);
                }
                this._schemaDesignerCache.delete(key);
            });
            this._schemaDesigners.set(key, schemaDesigner);
        }
        return this._schemaDesigners.get(key)!;
    }

    private static updateSchemaDesignerService(mainController?: MainController) {
        switch (getSchemaDesignerEngineConfig()) {
            case SchemaDesignerEngine.InMemory:
                if (!mainController) {
                    throw new Error("MainController is required for InMemory Schema Designer");
                }
                SchemaDesignerWebviewManager._schemaDesignerService =
                    new SchemaDesignerInMemoryService(
                        new MssqlPlatform(),
                        (uri) =>
                            new VscodeMssqlExecutor(
                                SqlToolsServiceClient.instance,
                                mainController.connectionManager,
                                uri,
                            ),
                    );
                break;
            case SchemaDesignerEngine.DacFx:
            default:
                SchemaDesignerWebviewManager._schemaDesignerService = new SchemaDesignerService(
                    SqlToolsServiceClient.instance,
                );
                break;
        }
    }
}
