/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import ConnectionManager from "../../controllers/connectionManager";
import SqlToolsServiceClient from "../../languageservice/serviceclient";
import { IConnectionProfile } from "../../models/interfaces";
import { SchemaDesigner } from "../../sharedInterfaces/schemaDesigner";
import {
    IDatabasePlatform,
    IGeneratorRegistry,
    IQueryExecutor,
    ISchemaObjectLoader,
    IScriptGenerator,
    ISyntaxProvider,
} from "./interfaces";
import { MssqlTableGenerator } from "./mssqlGenerators";
import { RequestType } from "vscode-languageclient";

function generateGuid() {
    // RFC4122 version 4 compliant UUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = (Math.random() * 16) | 0,
            v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

class MssqlSyntaxProvider implements ISyntaxProvider {
    quoteIdentifier(n: string) {
        return `[${n.replace(/]/g, "]]")}]`;
    }
    quoteString(v: string) {
        return `N'${v.replace(/'/g, "''")}'`;
    }
    qualifyName(s: string, n: string) {
        return `${this.quoteIdentifier(s)}.${this.quoteIdentifier(n)}`;
    }
    formatDataType(c: SchemaDesigner.Column): string {
        if (c.maxLength && (c.dataType.includes("char") || c.dataType.includes("binary"))) {
            const len = c.maxLength.toString() === "-1" ? "MAX" : c.maxLength;
            return `${c.dataType}(${len})`;
        }
        return c.dataType;
    }
}

class MssqlRegistry implements IGeneratorRegistry {
    private readonly _syntax = new MssqlSyntaxProvider();
    private readonly _gens = new Map<string, IScriptGenerator>();
    constructor() {
        this._gens.set("tables", new MssqlTableGenerator(this._syntax));
        //this._gens.set("views", new MssqlViewGenerator(this._syntax));
    }
    getSyntax() {
        return this._syntax;
    }
    getGenerator<T extends IScriptGenerator>(key: string) {
        return this._gens.get(key) as T;
    }
}

class MssqlTableLoader implements ISchemaObjectLoader {
    readonly objectTypeKey = "tables";
    async load(_uri: string, exec: IQueryExecutor) {
        const tablesQuery = `
            SELECT t.object_id, s.name, t.name
            FROM sys.tables t
            JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE t.is_ms_shipped = 0`;

        const columnsQuery = `
            SELECT 
                c.object_id,
                c.name,
                tp.name,
                c.max_length,
                c.precision,
                c.scale,
                c.is_nullable,
                c.is_identity,
                ISNULL(ic.seed_value, 0),
                ISNULL(ic.increment_value, 0),
                ISNULL(dc.definition, ''),
                c.is_computed,
                ISNULL(cc.definition, ''),
                ISNULL(cc.is_persisted, 0),
                c.column_id
            FROM sys.columns c
            JOIN sys.types tp ON c.user_type_id = tp.user_type_id
            LEFT JOIN sys.identity_columns ic ON c.object_id = ic.object_id AND c.column_id = ic.column_id
            LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id
            LEFT JOIN sys.computed_columns cc ON c.object_id = cc.object_id AND c.column_id = cc.column_id
            WHERE c.object_id IN (SELECT object_id FROM sys.tables WHERE is_ms_shipped = 0)
            ORDER BY c.object_id, c.column_id`;

        const pkQuery = `
            SELECT 
                t.object_id,
                kc.name,
                c.name
            FROM sys.key_constraints kc
            JOIN sys.index_columns ic ON kc.parent_object_id = ic.object_id AND kc.unique_index_id = ic.index_id
            JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
            JOIN sys.tables t ON kc.parent_object_id = t.object_id
            WHERE kc.type = 'PK'
            ORDER BY t.object_id, ic.key_ordinal`;

        const fkQuery = `
            SELECT 
                fk.parent_object_id,
                fk.name,
                c_parent.name,
                s_ref.name,
                t_ref.name,
                c_ref.name,
                fk.delete_referential_action,
                fk.update_referential_action,
                fk.object_id
            FROM sys.foreign_keys fk
            JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
            JOIN sys.columns c_parent ON fkc.parent_object_id = c_parent.object_id AND fkc.parent_column_id = c_parent.column_id
            JOIN sys.tables t_ref ON fkc.referenced_object_id = t_ref.object_id
            JOIN sys.schemas s_ref ON t_ref.schema_id = s_ref.schema_id
            JOIN sys.columns c_ref ON fkc.referenced_object_id = c_ref.object_id AND fkc.referenced_column_id = c_ref.column_id
            ORDER BY fk.parent_object_id, fk.object_id, fkc.constraint_column_id`;

        const [tables, columns, pks, fks] = await Promise.all([
            exec.execute(tablesQuery),
            exec.execute(columnsQuery),
            exec.execute(pkQuery),
            exec.execute(fkQuery),
        ]);

        const tableMap = new Map<string, SchemaDesigner.Table>();

        // 1. Tables
        for (const row of tables) {
            const id = row[0].toString();
            tableMap.set(id, {
                id,
                schema: row[1],
                name: row[2],
                columns: [],
                foreignKeys: [],
            });
        }

        // 2. Columns
        for (const row of columns) {
            const tableId = row[0].toString();
            const table = tableMap.get(tableId);
            if (table) {
                table.columns.push({
                    id: generateGuid(),
                    name: row[1],
                    dataType: row[2],
                    maxLength: row[3]?.toString() ?? "",
                    precision: parseInt(row[4]) || 0,
                    scale: parseInt(row[5]) || 0,
                    isNullable: row[6] === "1" || row[6] === 1 || row[6] === true,
                    isIdentity: row[7] === "1" || row[7] === 1 || row[7] === true,
                    identitySeed: parseInt(row[8]) || 0,
                    identityIncrement: parseInt(row[9]) || 0,
                    defaultValue: row[10],
                    isPrimaryKey: false, // Set later
                    isComputed: row[11] === "1" || row[11] === 1 || row[11] === true,
                    computedFormula: row[12],
                    computedPersisted: row[13] === "1" || row[13] === 1 || row[13] === true,
                });
            }
        }

        // 3. PKs
        for (const row of pks) {
            const tableId = row[0].toString();
            const table = tableMap.get(tableId);
            if (table) {
                table.primaryKeyName = row[1];
                const colName = row[2];
                const col = table.columns.find((c) => c.name === colName);
                if (col) col.isPrimaryKey = true;
            }
        }

        // 4. FKs (merge by name)
        const mapAction = (sysAction: any): SchemaDesigner.OnAction => {
            const val = parseInt(sysAction);
            switch (val) {
                case 0:
                    return SchemaDesigner.OnAction.NO_ACTION;
                case 1:
                    return SchemaDesigner.OnAction.CASCADE;
                case 2:
                    return SchemaDesigner.OnAction.SET_NULL;
                case 3:
                    return SchemaDesigner.OnAction.SET_DEFAULT;
                default:
                    return SchemaDesigner.OnAction.NO_ACTION;
            }
        };

        for (const row of fks) {
            const tableId = row[0].toString();
            const table = tableMap.get(tableId);
            if (table) {
                const fkName = row[1];
                let fk = table.foreignKeys.find((f) => f.name === fkName);
                if (!fk) {
                    fk = {
                        id: generateGuid(),
                        name: fkName,
                        columns: [],
                        referencedSchemaName: row[3],
                        referencedTableName: row[4],
                        referencedColumns: [],
                        onDeleteAction: mapAction(row[6]),
                        onUpdateAction: mapAction(row[7]),
                    };
                    table.foreignKeys.push(fk);
                }
                fk.columns.push(row[2]);
                fk.referencedColumns.push(row[5]);
            }
        }

        return Array.from(tableMap.values());
    }
}

// class MssqlViewLoader implements ISchemaObjectLoader {
//     readonly objectTypeKey = "views";
//     async load(_uri: string, exec: IQueryExecutor) {
//         const query = `
//             SELECT 
//                 v.object_id,
//                 s.name,
//                 v.name,
//                 m.definition
//             FROM sys.views v
//             JOIN sys.schemas s ON v.schema_id = s.schema_id
//             JOIN sys.sql_modules m ON v.object_id = m.object_id
//             WHERE v.is_ms_shipped = 0`;

//         const rows = await exec.execute(query);
//         return rows.map((row) => ({
//             id: row[0].toString(),
//             schema: row[1],
//             name: row[2],
//             definition: row[3] ?? "",
//         }));
//     }
// }

export class MssqlPlatform implements IDatabasePlatform {
    readonly name = "MSSQL";
    private readonly _registry = new MssqlRegistry();
    private readonly _loaders = [
        new MssqlTableLoader(),
        //new MssqlViewLoader()
    ];

    getGeneratorRegistry() {
        return this._registry;
    }
    getObjectLoaders() {
        return this._loaders;
    }
    wrapInTransaction(stmts: string[]): string {
        return `BEGIN TRY
    BEGIN TRANSACTION
${stmts.join("\n")}
    COMMIT TRANSACTION
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;`;
    }

    async getSchemaNames(ownerUri: string, exec: IQueryExecutor): Promise<string[]> {
        const query = "SELECT name FROM sys.schemas ORDER BY name";
        const rows = await exec.execute(query);
        return rows
            .map((r) => r[0].toString())
            .filter(
                (name) =>
                    name !== "sys" &&
                    name !== "INFORMATION_SCHEMA" &&
                    // check to exclude system schemas that start with 'db_'
                    !name.toLowerCase().startsWith("db_"),
            );
    }

    async getDataTypes(ownerUri: string, exec: IQueryExecutor): Promise<string[]> {
        const query = "SELECT name FROM sys.types WHERE is_user_defined = 0 ORDER BY name";
        const rows = await exec.execute(query);
        return rows.map((r) => r[0].toString());
    }
}
// Generic Executor for VSCode MSSQL

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
    ) { }

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
