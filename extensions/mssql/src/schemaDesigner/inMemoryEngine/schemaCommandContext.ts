/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SchemaDesigner } from "../../sharedInterfaces/schemaDesigner";
import { CommandGraph, CommandPhase } from "./commandGraph";
import { IGeneratorRegistry } from "./interfaces";

export class SchemaCommandContext {
    constructor(
        public readonly original: SchemaDesigner.Schema,
        public readonly updated: SchemaDesigner.Schema,
        public readonly graph: CommandGraph,
        public readonly registry: IGeneratorRegistry,
    ) {}

    createId(type: string, ...parts: string[]) {
        const sanitized = parts.map((p) => p.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase());
        return `${type}_${sanitized.join("_")}`;
    }

    addCommand(
        id: string,
        phase: CommandPhase,
        sql: string[],
        deps: string[] = [],
        desc?: string,
    ): boolean {
        if (!sql || sql.length === 0) return false;
        // Filter empty strings
        const validSql = sql.filter((s) => s && s.trim().length > 0);
        if (validSql.length === 0) return false;

        this.graph.addCommand({
            id,
            phase,
            statements: validSql,
            description: desc,
            dependencies: new Set(deps),
        });
        return true;
    }

    findCommandsForTable(tableName: string): string[] {
        const search = tableName.toLowerCase();
        return Array.from(this.graph.getAllCommandIds()).filter((id) => id.includes(search));
    }
}
