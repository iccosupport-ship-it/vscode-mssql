/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandPhase } from "../commandGraph";
import { ICodeObjectGenerator } from "../interfaces";
import { SchemaCommandContext } from "../schemaCommandContext";
import { ISchemaObjectHandler } from "../schemaObjectHandler";

export class ViewHandler implements ISchemaObjectHandler {
    buildCommands(ctx: SchemaCommandContext): void {
        const gen = ctx.registry.getGenerator<ICodeObjectGenerator>("views");

        const origViews = ctx.original.views || [];
        const updViews = ctx.updated.views || [];

        const allIds = new Set([...origViews.map((v) => v.id), ...updViews.map((v) => v.id)]);

        for (const id of allIds) {
            const orig = origViews.find((v) => v.id === id);
            const upd = updViews.find((v) => v.id === id);

            if (orig && !upd) {
                ctx.addCommand(
                    ctx.createId("drop_view", orig.name),
                    CommandPhase.Drop,
                    [gen.drop(orig.schema, orig.name)],
                    [],
                    `Drop view ${orig.name}`,
                );
            } else if (!orig && upd) {
                // New View - Depend on tables it might use
                const deps = ctx.findCommandsForTable(upd.definition); // Simple heuristic
                ctx.addCommand(
                    ctx.createId("create_view", upd.name),
                    CommandPhase.Create,
                    [gen.create(upd.schema, upd.name, upd.definition)],
                    deps,
                    `Create view ${upd.name}`,
                );
            } else if (orig && upd && orig.definition !== upd.definition) {
                // Alter View - Depend on tables
                const deps = ctx.findCommandsForTable(upd.definition);
                ctx.addCommand(
                    ctx.createId("alter_view", upd.name),
                    CommandPhase.Alter,
                    [gen.alter(upd.schema, upd.name, upd.definition)],
                    deps,
                    `Alter view ${upd.name}`,
                );
            }
        }
    }
}
