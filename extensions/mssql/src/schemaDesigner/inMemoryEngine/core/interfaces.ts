/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SchemaDesigner } from "../../../sharedInterfaces/schemaDesigner";
import { ISchemaObjectHandler } from "./schemaObjectHandler";

/**
 * 1. EXECUTION: Wraps the raw driver (e.g., mssql, pg)
 */
export interface IQueryExecutor {
    execute(query: string): Promise<any[]>;
}

/**
 * 2. SYNTAX: Handles quoting, types, and naming rules
 */
export interface ISyntaxProvider {
    quoteIdentifier(name: string): string;
    quoteString(value: string): string;
    qualifyName(schema: string, name: string): string;
    formatDataType(column: SchemaDesigner.Column): string;
}

/**
 * 3. GENERATORS: Granular SQL generation interfaces (Segregated)
 */
export interface IScriptGenerator {}

// Table Facet: Lifecycle
export interface ITableLifecycleGenerator {
    createTable(table: SchemaDesigner.Table): string;
    dropTable(table: SchemaDesigner.Table): string;
    renameTable(schema: string, oldName: string, newName: string): string;
    moveTableToSchema(table: SchemaDesigner.Table, targetSchema: string): string;
}

// Table Facet: Columns
export interface IColumnGenerator {
    add(table: SchemaDesigner.Table, column: SchemaDesigner.Column): string[];
    drop(table: SchemaDesigner.Table, column: SchemaDesigner.Column): string[];
    alter(
        table: SchemaDesigner.Table,
        oldCol: SchemaDesigner.Column,
        newCol: SchemaDesigner.Column,
    ): string[];
    rename(
        table: SchemaDesigner.Table,
        oldCol: SchemaDesigner.Column,
        newCol: SchemaDesigner.Column,
    ): string[];
}

// Table Facet: Constraints
export interface IConstraintGenerator {
    addPrimaryKey(table: SchemaDesigner.Table): string;
    dropPrimaryKey(table: SchemaDesigner.Table): string;
    addForeignKey(table: SchemaDesigner.Table, fk: SchemaDesigner.ForeignKey): string;
    dropForeignKey(table: SchemaDesigner.Table, fk: SchemaDesigner.ForeignKey): string;
    renameForeignKey(table: SchemaDesigner.Table, oldName: string, newName: string): string;
}

// Composite Table Generator
export interface ITableGenerator
    extends IScriptGenerator,
        ITableLifecycleGenerator,
        IColumnGenerator,
        IConstraintGenerator {
    // Generates the full schema script for initial hydration
    generateFullTableScript(table: SchemaDesigner.Table): string;
}

// Simple Object Generator (Views, Procs)
export interface ICodeObjectGenerator extends IScriptGenerator {
    create(schema: string, name: string, definition: string): string;
    drop(schema: string, name: string): string;
    alter(schema: string, name: string, definition: string): string;
}

/**
 * 4. REGISTRY: Looks up generators
 */
export interface IGeneratorRegistry {
    getSyntax(): ISyntaxProvider;
    getGenerator<T extends IScriptGenerator>(key: string): T;
}

/**
 * 5. LOADING: Composed Loaders
 */
export interface ISchemaObjectLoader {
    readonly objectTypeKey: keyof SchemaDesigner.Schema;
    load(ownerUri: string, executor: IQueryExecutor): Promise<any[]>;
}

/**
 * 6. PLATFORM: The Bundle
 */
export interface IDatabasePlatform {
    readonly name: string;
    getGeneratorRegistry(): IGeneratorRegistry;
    getObjectLoaders(): ISchemaObjectLoader[];
    getHandlers(): ISchemaObjectHandler[];
    wrapInTransaction(statements: string[]): string;
    getSchemaNames(ownerUri: string, executor: IQueryExecutor): Promise<string[]>;
    getDataTypes(ownerUri: string, executor: IQueryExecutor): Promise<string[]>;
}
