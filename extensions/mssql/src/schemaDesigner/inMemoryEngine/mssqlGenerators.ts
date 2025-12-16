/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SchemaDesigner } from "../../sharedInterfaces/schemaDesigner";
import {
    IColumnGenerator,
    ISyntaxProvider,
    ITableLifecycleGenerator,
    ITableGenerator,
    ICodeObjectGenerator,
    IConstraintGenerator,
} from "./interfaces";

// 1. Column Generator
export class MssqlColumnGenerator implements IColumnGenerator {
    constructor(private s: ISyntaxProvider) {}
    add(t: SchemaDesigner.Table, c: SchemaDesigner.Column): string[] {
        return [
            `ALTER TABLE ${this.s.qualifyName(t.schema, t.name)} ADD ${this.formatCol(c, true)}`,
        ];
    }
    drop(t: SchemaDesigner.Table, c: SchemaDesigner.Column): string[] {
        return [
            `ALTER TABLE ${this.s.qualifyName(t.schema, t.name)} DROP COLUMN ${this.s.quoteIdentifier(c.name)}`,
        ];
    }
    alter(t: SchemaDesigner.Table, o: SchemaDesigner.Column, n: SchemaDesigner.Column): string[] {
        const statements: string[] = [];

        if (o.defaultValue !== n.defaultValue) {
            if (o.defaultValue) {
                const tableName = this.s.qualifyName(t.schema, t.name);
                const colName = n.name;
                const sql = `DECLARE @ConstraintName nvarchar(200)
SELECT @ConstraintName = Name FROM sys.default_constraints
WHERE parent_object_id = OBJECT_ID(${this.s.quoteString(tableName)})
AND parent_column_id = (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID(${this.s.quoteString(tableName)}) AND name = ${this.s.quoteString(colName)})
IF @ConstraintName IS NOT NULL
EXEC('ALTER TABLE ${tableName} DROP CONSTRAINT ' + @ConstraintName)`;
                statements.push(sql);
            }
            if (n.defaultValue) {
                statements.push(
                    `ALTER TABLE ${this.s.qualifyName(t.schema, t.name)} ADD DEFAULT ${n.defaultValue} FOR ${this.s.quoteIdentifier(n.name)}`,
                );
            }
        }

        if (this.basePropsChanged(o, n)) {
            statements.push(
                `ALTER TABLE ${this.s.qualifyName(t.schema, t.name)} ALTER COLUMN ${this.formatCol(n, false)}`,
            );
        }

        return statements;
    }

    private basePropsChanged(o: SchemaDesigner.Column, n: SchemaDesigner.Column): boolean {
        return (
            o.dataType !== n.dataType ||
            o.maxLength !== n.maxLength ||
            o.precision !== n.precision ||
            o.scale !== n.scale ||
            o.isNullable !== n.isNullable
        );
    }

    private formatCol(c: SchemaDesigner.Column, includeDefault: boolean): string {
        const parts = [this.s.quoteIdentifier(c.name), this.s.formatDataType(c)];
        parts.push(c.isNullable ? "NULL" : "NOT NULL");
        if (includeDefault && c.defaultValue) {
            parts.push(`DEFAULT ${c.defaultValue}`);
        }
        if (c.isIdentity) parts.push(`IDENTITY(${c.identitySeed},${c.identityIncrement})`);
        return parts.join(" ");
    }
}

// 2. Lifecycle Generator
export class MssqlTableLifecycleGenerator implements ITableLifecycleGenerator {
    constructor(private s: ISyntaxProvider) {}
    createTable(t: SchemaDesigner.Table): string {
        const cols = t.columns.map((c) => {
            const parts = [this.s.quoteIdentifier(c.name), this.s.formatDataType(c)];
            parts.push(c.isNullable ? "NULL" : "NOT NULL");
            if (c.defaultValue) {
                parts.push(`DEFAULT ${c.defaultValue}`);
            }
            if (c.isIdentity) parts.push(`IDENTITY(${c.identitySeed},${c.identityIncrement})`);
            return "    " + parts.join(" ");
        });

        if (t.primaryKeyName && t.columns.some((c) => c.isPrimaryKey)) {
            const pkCols = t.columns
                .filter((c) => c.isPrimaryKey)
                .map((c) => this.s.quoteIdentifier(c.name))
                .join(", ");
            cols.push(
                `    CONSTRAINT ${this.s.quoteIdentifier(t.primaryKeyName)} PRIMARY KEY (${pkCols})`,
            );
        }

        return `CREATE TABLE ${this.s.qualifyName(t.schema, t.name)} (\n${cols.join(",\n")}\n);`;
    }
    dropTable(t: SchemaDesigner.Table): string {
        return `DROP TABLE ${this.s.qualifyName(t.schema, t.name)}`;
    }
    renameTable(s: string, o: string, n: string): string {
        return `EXEC sp_rename '${this.s.qualifyName(s, o)}', '${n}'`;
    }
}

// 3. Constraint Generator
export class MssqlConstraintGenerator implements IConstraintGenerator {
    constructor(private s: ISyntaxProvider) {}

    addPrimaryKey(t: SchemaDesigner.Table): string {
        const pkCols = t.columns
            .filter((c) => c.isPrimaryKey)
            .map((c) => this.s.quoteIdentifier(c.name))
            .join(", ");
        const pkName = t.primaryKeyName || `PK_${t.name}`;
        return `ALTER TABLE ${this.s.qualifyName(t.schema, t.name)} ADD CONSTRAINT ${this.s.quoteIdentifier(pkName)} PRIMARY KEY (${pkCols})`;
    }

    dropPrimaryKey(t: SchemaDesigner.Table): string {
        const pkName = t.primaryKeyName || `PK_${t.name}`;
        return `ALTER TABLE ${this.s.qualifyName(t.schema, t.name)} DROP CONSTRAINT ${this.s.quoteIdentifier(pkName)}`;
    }

    addForeignKey(t: SchemaDesigner.Table, fk: SchemaDesigner.ForeignKey): string {
        const cols = fk.columns.map((c) => this.s.quoteIdentifier(c)).join(", ");
        const refCols = fk.referencedColumns.map((c) => this.s.quoteIdentifier(c)).join(", ");
        return `ALTER TABLE ${this.s.qualifyName(t.schema, t.name)} ADD CONSTRAINT ${this.s.quoteIdentifier(fk.name)} FOREIGN KEY (${cols}) REFERENCES ${this.s.qualifyName(fk.referencedSchemaName, fk.referencedTableName)} (${refCols})`;
    }

    dropForeignKey(t: SchemaDesigner.Table, fk: SchemaDesigner.ForeignKey): string {
        return `ALTER TABLE ${this.s.qualifyName(t.schema, t.name)} DROP CONSTRAINT ${this.s.quoteIdentifier(fk.name)}`;
    }
}

// 4. Composite Table Generator
export class MssqlTableGenerator implements ITableGenerator {
    private readonly _lifecycle: MssqlTableLifecycleGenerator;
    private readonly _columns: MssqlColumnGenerator;
    private readonly _constraints: MssqlConstraintGenerator;

    constructor(s: ISyntaxProvider) {
        this._lifecycle = new MssqlTableLifecycleGenerator(s);
        this._columns = new MssqlColumnGenerator(s);
        this._constraints = new MssqlConstraintGenerator(s);
    }

    createTable(t: SchemaDesigner.Table) {
        return this._lifecycle.createTable(t);
    }
    dropTable(t: SchemaDesigner.Table) {
        return this._lifecycle.dropTable(t);
    }
    renameTable(s: string, o: string, n: string) {
        return this._lifecycle.renameTable(s, o, n);
    }
    add(t: SchemaDesigner.Table, c: SchemaDesigner.Column) {
        return this._columns.add(t, c);
    }
    drop(t: SchemaDesigner.Table, c: SchemaDesigner.Column) {
        return this._columns.drop(t, c);
    }
    alter(t: SchemaDesigner.Table, o: SchemaDesigner.Column, n: SchemaDesigner.Column) {
        return this._columns.alter(t, o, n);
    }
    addPrimaryKey(t: SchemaDesigner.Table) {
        return this._constraints.addPrimaryKey(t);
    }
    dropPrimaryKey(t: SchemaDesigner.Table) {
        return this._constraints.dropPrimaryKey(t);
    }
    addForeignKey(t: SchemaDesigner.Table, fk: SchemaDesigner.ForeignKey) {
        return this._constraints.addForeignKey(t, fk);
    }
    dropForeignKey(t: SchemaDesigner.Table, fk: SchemaDesigner.ForeignKey) {
        return this._constraints.dropForeignKey(t, fk);
    }
    generateFullTableScript(t: SchemaDesigner.Table) {
        const statements = [this.createTable(t)];
        for (const fk of t.foreignKeys) {
            statements.push(this.addForeignKey(t, fk));
        }
        return statements.join("\n");
    }
}

// 5. View Generator
export class MssqlViewGenerator implements ICodeObjectGenerator {
    constructor(private s: ISyntaxProvider) {}
    create(_sch: string, _n: string, def: string) {
        return def;
    }
    drop(sch: string, n: string) {
        return `DROP VIEW ${this.s.qualifyName(sch, n)}`;
    }
    alter(_sch: string, _n: string, def: string) {
        // Simple heuristic: replace CREATE with ALTER if it starts with CREATE
        // In a real implementation, we might need more robust parsing
        if (def.trim().toUpperCase().startsWith("CREATE")) {
            return def.replace(/^CREATE\s+VIEW/i, "ALTER VIEW");
        }
        return def;
    }
}
