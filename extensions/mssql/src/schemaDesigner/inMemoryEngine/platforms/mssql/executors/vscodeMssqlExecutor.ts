/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from "vscode-languageclient";
import ConnectionManager from "../../../../../controllers/connectionManager";
import SqlToolsServiceClient from "../../../../../languageservice/serviceclient";
import { IConnectionProfile } from "../../../../../models/interfaces";
import { IQueryExecutor } from "../../../core/interfaces";

export namespace SimpleExecuteRequest {
    export const type = new RequestType<SimpleExecuteParams, SimpleExecuteResult, void, void>(
        "query/simpleexecute",
    );
}

export interface SimpleExecuteParams {
    ownerUri: string;
    queryString: string;
}

export interface SimpleExecuteResult {
    rowCount: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows: any[][];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    columnInfo: any[];
}

export class VscodeMssqlExecutor implements IQueryExecutor {
    private static readonly _maxQueryRetries = 3;
    private static readonly _baseRetryDelayMs = 1000;

    constructor(
        private readonly _client: SqlToolsServiceClient,
        private readonly _connectionManager: ConnectionManager,
        private readonly _ownerUri: string,
    ) {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async execute(query: string): Promise<any[]> {
        const trimmedQuery = query.trim();
        let lastError: unknown;
        const connectionInfo = this._connectionManager.getConnectionInfo(this._ownerUri);

        for (let attempt = 1; attempt <= VscodeMssqlExecutor._maxQueryRetries; attempt++) {
            try {
                await this.ensureConnection(
                    this._ownerUri,
                    connectionInfo?.credentials as IConnectionProfile,
                );
                console.log(
                    `[SchemaDesigner Live Engine] Executing query (attempt ${attempt}/${VscodeMssqlExecutor._maxQueryRetries}) on ${this._ownerUri}:`,
                );
                console.log(trimmedQuery);
                const result = await this._client.sendRequest(SimpleExecuteRequest.type, {
                    ownerUri: this._ownerUri,
                    queryString: query,
                });
                console.log(
                    `[SchemaDesigner Live Engine] Query execution completed in attempt ${attempt}. ${result.rowCount ?? result.rows?.length ?? 0} rows returned`,
                );
                return this.parseRows(result.rows);
            } catch (error) {
                lastError = error;
                const message = (error as Error)?.message ?? "";
                console.error(
                    `[SchemaDesigner Live Engine] Query attempt ${attempt} failed: ${message || error}`,
                );
                if (connectionInfo && this.isInvalidOwnerUriError(error)) {
                    try {
                        await this.ensureConnection(
                            this._ownerUri,
                            connectionInfo.credentials as IConnectionProfile,
                            true,
                        );
                        continue;
                    } catch (reconnectError) {
                        console.error(
                            `[SchemaDesigner Live Engine] Reconnection failed: ${(reconnectError as Error)?.message ?? reconnectError}`,
                        );
                        lastError = reconnectError;
                    }
                }
                if (attempt === VscodeMssqlExecutor._maxQueryRetries) {
                    break;
                }
                const delay = VscodeMssqlExecutor._baseRetryDelayMs * Math.pow(2, attempt - 1);
                await this.delay(delay);
            }
        }
        throw lastError ?? new Error("Query execution failed");
    }

    private async ensureConnection(
        ownerUri: string,
        profile?: IConnectionProfile,
        forceReconnect: boolean = false,
    ): Promise<void> {
        if (!ownerUri) {
            throw new Error("Owner URI is required for schema designer queries");
        }
        if (!forceReconnect && this._connectionManager.isConnected(ownerUri)) {
            return;
        }
        if (!profile) {
            throw new Error(
                "The schema designer connection was closed and no profile is available to reconnect.",
            );
        }
        if (forceReconnect && this._connectionManager.isConnected(ownerUri)) {
            await this._connectionManager.disconnect(ownerUri);
        }
        const reconnected = await this._connectionManager.connect(ownerUri, profile, {
            shouldHandleErrors: true,
            connectionSource: "schemaDesigner",
        });
        if (!reconnected) {
            throw new Error("Failed to re-establish schema designer connection");
        }
    }

    private parseRows(rows: any[][]): any[][] {
        return rows.map((row) =>
            row.map((cell) => {
                if (cell === null || cell === undefined) {
                    return null;
                }
                // Handle DbCellValue object from SimpleExecuteRequest
                if (typeof cell === "object" && "displayValue" in cell) {
                    return cell.isNull ? null : cell.displayValue;
                }
                return cell;
            }),
        );
    }

    private isInvalidOwnerUriError(error: unknown): boolean {
        const message = typeof error === "string" ? error : ((error as Error)?.message ?? "");
        return message.toLowerCase().includes("invalid owneruri");
    }

    private async delay(ms: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
}
