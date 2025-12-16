/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SchemaDesigner } from "../../../sharedInterfaces/schemaDesigner";
import { CommandPhase } from "../commandGraph";
import { ITableGenerator, ISyntaxProvider } from "../interfaces";
import { SchemaCommandContext } from "../schemaCommandContext";
import { ISchemaObjectHandler } from "../schemaObjectHandler";

export class TableHandler implements ISchemaObjectHandler {
    buildCommands(context: SchemaCommandContext): void {
        const gen = context.registry.getGenerator<ITableGenerator>("tables");
        const syntax = context.registry.getSyntax();

        const originalMap = new Map(
            context.original.tables.map((table) => [this.getTableIdentifier(table), table]),
        );
        const updatedMap = new Map(
            context.updated.tables.map((table) => [this.getTableIdentifier(table), table]),
        );

        for (const [tableId, originalTable] of originalMap) {
            if (!updatedMap.has(tableId)) {
                this.enqueueDropTableCommands(context, originalTable, gen, syntax);
            }
        }

        for (const [tableId, updatedTable] of updatedMap) {
            const originalTable = originalMap.get(tableId);
            if (!originalTable) {
                this.enqueueCreateTableCommands(context, updatedTable, gen, syntax);
            } else {
                this.enqueueTableDiffCommands(context, originalTable, updatedTable, gen, syntax);
            }
        }
    }

    private enqueueDropTableCommands(
        context: SchemaCommandContext,
        table: SchemaDesigner.Table,
        gen: ITableGenerator,
        syntax: ISyntaxProvider,
    ) {
        const dropDependencies: string[] = [];
        for (const otherTable of context.original.tables) {
            if (otherTable.id === table.id) {
                continue;
            }
            for (const fk of otherTable.foreignKeys) {
                if (
                    fk.referencedSchemaName === table.schema &&
                    fk.referencedTableName === table.name
                ) {
                    const dropFkId = context.createId(
                        "drop_fk",
                        otherTable.schema,
                        otherTable.name,
                        fk.name,
                    );
                    const description = `Drop foreign key ${syntax.qualifyName(otherTable.schema, otherTable.name)}.${syntax.quoteIdentifier(fk.name)}`;
                    const added = context.addCommand(
                        dropFkId,
                        CommandPhase.Drop,
                        [gen.dropForeignKey(otherTable, fk)],
                        [],
                        description,
                    );
                    if (added) {
                        dropDependencies.push(dropFkId);
                    }
                }
            }
        }

        const dropTableId = context.createId("drop_table", table.schema, table.name);
        context.addCommand(
            dropTableId,
            CommandPhase.Drop,
            [`DROP TABLE ${syntax.qualifyName(table.schema, table.name)};`],
            dropDependencies,
            `Drop table ${syntax.qualifyName(table.schema, table.name)}`,
        );
    }

    private enqueueCreateTableCommands(
        context: SchemaCommandContext,
        table: SchemaDesigner.Table,
        gen: ITableGenerator,
        syntax: ISyntaxProvider,
    ) {
        const createTableId = context.createId("create_table", table.schema, table.name);
        context.addCommand(
            createTableId,
            CommandPhase.Create,
            [gen.createTable(table)],
            [],
            `Create table ${syntax.qualifyName(table.schema, table.name)}`,
        );

        for (const fk of table.foreignKeys) {
            const fkId = context.createId("create_fk", table.schema, table.name, fk.name);
            const dependencies = [createTableId];
            dependencies.push(
                context.createId("create_table", fk.referencedSchemaName, fk.referencedTableName),
            );
            context.addCommand(
                fkId,
                CommandPhase.Create,
                [gen.addForeignKey(table, fk)],
                dependencies,
                `Create foreign key ${syntax.qualifyName(table.schema, table.name)}.${syntax.quoteIdentifier(fk.name)}`,
            );
        }
    }

    private enqueueTableDiffCommands(
        context: SchemaCommandContext,
        originalTable: SchemaDesigner.Table,
        updatedTable: SchemaDesigner.Table,
        gen: ITableGenerator,
        syntax: ISyntaxProvider,
    ) {
        const tableName = syntax.qualifyName(updatedTable.schema, updatedTable.name);
        const originalTableName = syntax.qualifyName(originalTable.schema, originalTable.name);
        const originalColumns = new Map(
            originalTable.columns.map((column) => [this.getColumnIdentifier(column), column]),
        );
        const updatedColumns = new Map(
            updatedTable.columns.map((column) => [this.getColumnIdentifier(column), column]),
        );
        const originalForeignKeys = new Map(
            originalTable.foreignKeys.map((fk) => [this.getForeignKeyIdentifier(fk), fk]),
        );
        const updatedForeignKeys = new Map(
            updatedTable.foreignKeys.map((fk) => [this.getForeignKeyIdentifier(fk), fk]),
        );

        const columnCommandIds: string[] = [];
        const dropForeignKeyIds = new Map<string, string>();
        const tableCommandDependencies: string[] = [];
        const columnRenameCommands = new Map<string, string>();

        for (const [fkId, originalFk] of originalForeignKeys) {
            const matchingFk = updatedForeignKeys.get(fkId);
            if (!matchingFk || this.isForeignKeyDifferent(originalFk, matchingFk)) {
                const dropId = context.createId(
                    "drop_fk",
                    originalTable.schema,
                    originalTable.name,
                    originalFk.name,
                );
                const description = `Drop foreign key ${syntax.qualifyName(originalTable.schema, originalTable.name)}.${syntax.quoteIdentifier(originalFk.name)}`;
                const added = context.addCommand(
                    dropId,
                    CommandPhase.Drop,
                    [gen.dropForeignKey(originalTable, originalFk)],
                    [],
                    description,
                );
                if (added) {
                    dropForeignKeyIds.set(fkId, dropId);
                }
            }
        }

        if (originalTable.schema !== updatedTable.schema) {
            const transferId = context.createId(
                "transfer_table_schema",
                originalTable.schema,
                originalTable.name,
                updatedTable.schema,
            );
            const description = `Move table ${originalTableName} to schema ${syntax.quoteIdentifier(updatedTable.schema)}`;
            const added = context.addCommand(
                transferId,
                CommandPhase.Alter,
                [
                    `ALTER SCHEMA ${syntax.quoteIdentifier(updatedTable.schema)} TRANSFER ${originalTableName};`,
                ],
                [],
                description,
            );
            if (added) {
                tableCommandDependencies.push(transferId);
            }
        }

        if (originalTable.name !== updatedTable.name) {
            const renameId = context.createId(
                "rename_table",
                originalTable.schema,
                originalTable.name,
                updatedTable.name,
            );
            const renameDependencies = [...tableCommandDependencies];
            const renameSchema = updatedTable.schema;
            const description = `Rename table ${syntax.qualifyName(renameSchema, originalTable.name)} to ${tableName}`;
            const added = context.addCommand(
                renameId,
                CommandPhase.Alter,
                [
                    `EXEC sp_rename ${syntax.quoteString(
                        syntax.qualifyName(renameSchema, originalTable.name),
                    )}, ${syntax.quoteString(updatedTable.name)};`,
                ],
                renameDependencies,
                description,
            );
            if (added) {
                tableCommandDependencies.push(renameId);
            }
        }

        for (const [fkIdentifier, updatedFk] of updatedForeignKeys) {
            const originalFk = originalForeignKeys.get(fkIdentifier);
            if (
                originalFk &&
                originalFk.name !== updatedFk.name &&
                !this.isForeignKeyDifferent(originalFk, updatedFk)
            ) {
                const renameId = context.createId(
                    "rename_fk",
                    updatedTable.schema,
                    updatedTable.name,
                    originalFk.name,
                );
                const description = `Rename foreign key ${syntax.qualifyName(updatedTable.schema, updatedTable.name)}.${syntax.quoteIdentifier(originalFk.name)} to ${syntax.quoteIdentifier(updatedFk.name)}`;
                context.addCommand(
                    renameId,
                    CommandPhase.Alter,
                    [
                        `EXEC sp_rename ${syntax.quoteString(
                            `${syntax.quoteIdentifier(updatedTable.schema)}.${syntax.quoteIdentifier(originalFk.name)}`,
                        )}, ${syntax.quoteString(updatedFk.name)}, 'OBJECT';`,
                    ],
                    [...tableCommandDependencies],
                    description,
                );
            }
        }

        const buildColumnDependencies = (columnId: string, extra: string[] = []) => {
            const dependencies = [...tableCommandDependencies];
            const renameCommand = columnRenameCommands.get(columnId);
            if (renameCommand) {
                dependencies.push(renameCommand);
            }
            dependencies.push(...extra);
            return dependencies;
        };

        for (const [columnId, originalColumn] of originalColumns) {
            if (!updatedColumns.has(columnId)) {
                const cmdId = context.createId(
                    "drop_column",
                    originalTable.schema,
                    originalTable.name,
                    originalColumn.name,
                );
                const added = context.addCommand(
                    cmdId,
                    CommandPhase.Alter,
                    gen.drop(updatedTable, originalColumn),
                    buildColumnDependencies(columnId),
                    `Drop column ${syntax.qualifyName(originalTable.schema, originalTable.name)}.${syntax.quoteIdentifier(originalColumn.name)}`,
                );
                if (added) {
                    columnCommandIds.push(cmdId);
                }
            }
        }

        for (const [columnId, updatedColumn] of updatedColumns) {
            const originalColumn = originalColumns.get(columnId);
            if (!originalColumn) {
                const cmdId = context.createId(
                    "add_column",
                    updatedTable.schema,
                    updatedTable.name,
                    updatedColumn.name,
                );
                const added = context.addCommand(
                    cmdId,
                    CommandPhase.Alter,
                    gen.add(updatedTable, updatedColumn),
                    buildColumnDependencies(columnId),
                    `Add column ${syntax.qualifyName(updatedTable.schema, updatedTable.name)}.${syntax.quoteIdentifier(updatedColumn.name)}`,
                );
                if (added) {
                    columnCommandIds.push(cmdId);
                }
            } else {
                if (originalColumn.name !== updatedColumn.name) {
                    const renameId = context.createId(
                        "rename_column",
                        updatedTable.schema,
                        updatedTable.name,
                        originalColumn.name,
                    );
                    const description = `Rename column ${syntax.qualifyName(updatedTable.schema, updatedTable.name)}.${syntax.quoteIdentifier(originalColumn.name)} to ${syntax.quoteIdentifier(updatedColumn.name)}`;
                    const renameAdded = context.addCommand(
                        renameId,
                        CommandPhase.Alter,
                        [
                            `EXEC sp_rename ${syntax.quoteString(
                                syntax.qualifyName(updatedTable.schema, updatedTable.name) +
                                    "." +
                                    syntax.quoteIdentifier(originalColumn.name),
                            )}, ${syntax.quoteString(updatedColumn.name)}, 'COLUMN';`,
                        ],
                        [...tableCommandDependencies],
                        description,
                    );
                    if (renameAdded) {
                        columnRenameCommands.set(columnId, renameId);
                        columnCommandIds.push(renameId);
                    }
                }

                if (this.columnRequiresRecreation(originalColumn, updatedColumn)) {
                    const dropId = context.createId(
                        "recreate_drop_column",
                        updatedTable.schema,
                        updatedTable.name,
                        originalColumn.name,
                    );
                    const dropAdded = context.addCommand(
                        dropId,
                        CommandPhase.Alter,
                        gen.drop(updatedTable, originalColumn),
                        buildColumnDependencies(columnId),
                        `Drop column ${syntax.qualifyName(updatedTable.schema, updatedTable.name)}.${syntax.quoteIdentifier(originalColumn.name)} for recreation`,
                    );
                    const addId = context.createId(
                        "recreate_add_column",
                        updatedTable.schema,
                        updatedTable.name,
                        updatedColumn.name,
                    );
                    const addDependencies = buildColumnDependencies(columnId);
                    if (dropAdded) {
                        addDependencies.push(dropId);
                    }
                    const addAdded = context.addCommand(
                        addId,
                        CommandPhase.Alter,
                        gen.add(updatedTable, updatedColumn),
                        addDependencies,
                        `Recreate column ${syntax.qualifyName(updatedTable.schema, updatedTable.name)}.${syntax.quoteIdentifier(updatedColumn.name)}`,
                    );
                    if (dropAdded) {
                        columnCommandIds.push(dropId);
                    }
                    if (addAdded) {
                        columnCommandIds.push(addId);
                    }
                } else if (this.isColumnDifferent(originalColumn, updatedColumn)) {
                    const cmdId = context.createId(
                        "alter_column",
                        updatedTable.schema,
                        updatedTable.name,
                        updatedColumn.name,
                    );
                    const statements = gen.alter(updatedTable, originalColumn, updatedColumn);
                    const added = context.addCommand(
                        cmdId,
                        CommandPhase.Alter,
                        statements,
                        buildColumnDependencies(columnId),
                        `Alter column ${syntax.qualifyName(updatedTable.schema, updatedTable.name)}.${syntax.quoteIdentifier(updatedColumn.name)}`,
                    );
                    if (added) {
                        columnCommandIds.push(cmdId);
                    }
                }
            }
        }

        let dropPkDependency: string | undefined;
        if (this.isPrimaryKeyDifferent(originalTable, updatedTable)) {
            const dropPkId = context.createId("drop_pk", originalTable.schema, originalTable.name);
            const pkName = originalTable.primaryKeyName || `PK_${originalTable.name}`;
            const dropAdded = context.addCommand(
                dropPkId,
                CommandPhase.Drop,
                originalTable.columns.some((c) => c.isPrimaryKey)
                    ? [
                          `ALTER TABLE ${originalTableName} DROP CONSTRAINT ${syntax.quoteIdentifier(pkName)};`,
                      ]
                    : [],
                [],
                `Drop primary key on ${syntax.qualifyName(originalTable.schema, originalTable.name)}`,
            );
            if (dropAdded) {
                dropPkDependency = dropPkId;
            }

            const updatedPkColumns = updatedTable.columns.filter((c) => c.isPrimaryKey);
            if (updatedPkColumns.length > 0) {
                const addPkId = context.createId("add_pk", updatedTable.schema, updatedTable.name);
                const dependencies = [...columnCommandIds];
                if (dropPkDependency) {
                    dependencies.push(dropPkDependency);
                }
                const newPkName = updatedTable.primaryKeyName || `PK_${updatedTable.name}`;
                context.addCommand(
                    addPkId,
                    CommandPhase.Create,
                    [
                        `ALTER TABLE ${tableName} ADD CONSTRAINT ${syntax.quoteIdentifier(newPkName)} PRIMARY KEY (${updatedPkColumns
                            .map((c) => syntax.quoteIdentifier(c.name))
                            .join(", ")});`,
                    ],
                    dependencies,
                    `Create primary key on ${syntax.qualifyName(updatedTable.schema, updatedTable.name)}`,
                );
            }
        }

        for (const [fkIdentifier, fk] of updatedForeignKeys) {
            const originalFk = originalForeignKeys.get(fkIdentifier);
            if (!originalFk || this.isForeignKeyDifferent(originalFk, fk)) {
                const createFkId = context.createId(
                    "create_fk",
                    updatedTable.schema,
                    updatedTable.name,
                    fk.name,
                );
                const dependencies = [...columnCommandIds];
                const dropId = dropForeignKeyIds.get(fkIdentifier);
                if (dropId) {
                    dependencies.push(dropId);
                }
                dependencies.push(
                    context.createId(
                        "create_table",
                        fk.referencedSchemaName,
                        fk.referencedTableName,
                    ),
                );
                context.addCommand(
                    createFkId,
                    CommandPhase.Create,
                    [gen.addForeignKey(updatedTable, fk)],
                    dependencies,
                    `Create foreign key ${syntax.qualifyName(updatedTable.schema, updatedTable.name)}.${syntax.quoteIdentifier(fk.name)}`,
                );
            }
        }
    }

    private isColumnDifferent(
        original: SchemaDesigner.Column,
        updated: SchemaDesigner.Column,
    ): boolean {
        if (original.dataType !== updated.dataType) return true;
        if (original.maxLength !== updated.maxLength) return true;
        if (original.precision !== updated.precision) return true;
        if (original.scale !== updated.scale) return true;
        if (original.isNullable !== updated.isNullable) return true;
        if (original.defaultValue !== updated.defaultValue) return true;
        return false;
    }

    private columnRequiresRecreation(
        original: SchemaDesigner.Column,
        updated: SchemaDesigner.Column,
    ): boolean {
        if (original.isComputed !== updated.isComputed) {
            return true;
        }
        if (
            original.isComputed &&
            updated.isComputed &&
            (original.computedFormula !== updated.computedFormula ||
                original.computedPersisted !== updated.computedPersisted)
        ) {
            return true;
        }
        if (original.isIdentity !== updated.isIdentity) {
            return true;
        }
        if (
            original.isIdentity &&
            updated.isIdentity &&
            (original.identitySeed !== updated.identitySeed ||
                original.identityIncrement !== updated.identityIncrement)
        ) {
            return true;
        }
        return false;
    }

    private isPrimaryKeyDifferent(
        original: SchemaDesigner.Table,
        updated: SchemaDesigner.Table,
    ): boolean {
        const originalPk = original.columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
        const updatedPk = updated.columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
        if (originalPk.length !== updatedPk.length) {
            return true;
        }
        for (let i = 0; i < originalPk.length; i++) {
            if (originalPk[i] !== updatedPk[i]) {
                return true;
            }
        }
        return false;
    }

    private isForeignKeyDifferent(
        original: SchemaDesigner.ForeignKey,
        updated: SchemaDesigner.ForeignKey,
    ): boolean {
        const basePropsChanged =
            original.referencedSchemaName !== updated.referencedSchemaName ||
            original.referencedTableName !== updated.referencedTableName ||
            original.onDeleteAction !== updated.onDeleteAction ||
            original.onUpdateAction !== updated.onUpdateAction;
        if (basePropsChanged) {
            return true;
        }
        if (original.columns.length !== updated.columns.length) {
            return true;
        }
        for (let i = 0; i < original.columns.length; i++) {
            if (
                original.columns[i] !== updated.columns[i] ||
                original.referencedColumns[i] !== updated.referencedColumns[i]
            ) {
                return true;
            }
        }
        return false;
    }

    private getTableIdentifier(table: SchemaDesigner.Table): string {
        return table.id ?? `${table.schema}.${table.name}`.toLowerCase();
    }

    private getColumnIdentifier(column: SchemaDesigner.Column): string {
        return column.id ?? column.name;
    }

    private getForeignKeyIdentifier(fk: SchemaDesigner.ForeignKey): string {
        return fk.id ?? fk.name;
    }
}
