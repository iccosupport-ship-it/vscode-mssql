/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SchemaDesigner } from "../../../../../sharedInterfaces/schemaDesigner";
import { generateGuid } from "../../../../../models/utils";
import { IQueryExecutor, ISchemaObjectLoader } from "../../../core/interfaces";

export class MssqlTableLoader implements ISchemaObjectLoader {
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
                    isPrimaryKey: false,
                    isComputed: row[11] === "1" || row[11] === 1 || row[11] === true,
                    computedFormula: row[12],
                    computedPersisted: row[13] === "1" || row[13] === 1 || row[13] === true,
                });
            }
        }

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
                    } as SchemaDesigner.ForeignKey;
                    table.foreignKeys.push(fk);
                }
                fk.columns.push(row[2]);
                fk.referencedColumns.push(row[5]);
            }
        }

        return Array.from(tableMap.values());
    }
}
