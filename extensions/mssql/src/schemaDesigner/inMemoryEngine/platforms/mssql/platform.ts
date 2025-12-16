/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SchemaDesigner } from "../../../../sharedInterfaces/schemaDesigner";
import {
    IDatabasePlatform,
    IGeneratorRegistry,
    IQueryExecutor,
    IScriptGenerator,
    ISyntaxProvider,
} from "../../core/interfaces";
import { TableHandler } from "../../handlers/tableHandler";
import { MssqlTableGenerator } from "./generators";
import { MssqlTableLoader } from "./loaders/tableLoader";

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
    }
    getSyntax() {
        return this._syntax;
    }
    getGenerator<T extends IScriptGenerator>(key: string) {
        return this._gens.get(key) as T;
    }
}

export class MssqlPlatform implements IDatabasePlatform {
    readonly name = "MSSQL";
    private readonly _registry = new MssqlRegistry();
    private readonly _loaders = [
        new MssqlTableLoader(),
        //new MssqlViewLoader()
    ];
    private readonly _handlerFactories = [() => new TableHandler()];

    getGeneratorRegistry() {
        return this._registry;
    }
    getObjectLoaders() {
        return this._loaders;
    }
    getHandlers() {
        return this._handlerFactories.map((create) => create());
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
